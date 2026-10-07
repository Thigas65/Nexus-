function errorMessage(result) {
  return typeof result.error === "string"
    ? result.error
    : typeof result.message === "string"
      ? result.message
      : "Não foi possível obter uma resposta do assistente. Tente novamente.";
}

export async function consumeChatResponse(response, onChunk = () => {}) {
  if (!response.ok) {
    let result;
    try {
      result = await response.json();
    } catch {
      throw new Error("O servidor retornou uma resposta inválida. Tente novamente.");
    }
    throw new Error(errorMessage(result));
  }

  if (!response.headers.get("content-type")?.toLowerCase().includes("text/event-stream")) {
    let result;
    try {
      result = await response.json();
    } catch {
      throw new Error("O servidor retornou uma resposta inválida. Tente novamente.");
    }
    if (typeof result.reply !== "string" || !result.reply.trim()) {
      throw new Error("O assistente retornou uma resposta vazia. Tente novamente.");
    }
    return result.reply;
  }

  if (!response.body) {
    throw new Error("O servidor encerrou o streaming sem enviar uma resposta.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let complete = false;
  let resultText = "";

  function processEvent(block) {
    let event = "message";
    const data = [];
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
    }
    if (data.length === 0) return;

    let payload;
    try {
      payload = JSON.parse(data.join("\n"));
    } catch {
      throw new Error("O servidor enviou um evento de streaming inválido.");
    }
    if (event === "chunk") {
      if (typeof payload.text !== "string" || !payload.text) return;
      resultText += payload.text;
      onChunk(payload.text);
    } else if (event === "error") {
      throw new Error(errorMessage(payload));
    } else if (event === "done") {
      complete = true;
    }
  }

  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let match;
      while ((match = /\r?\n\r?\n/.exec(buffer))) {
        processEvent(buffer.slice(0, match.index));
        buffer = buffer.slice(match.index + match[0].length);
      }
      if (done) break;
    }
    if (buffer.trim()) processEvent(buffer);
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error("A conexão com o servidor foi interrompida durante a resposta.");
  } finally {
    reader.releaseLock();
  }

  if (!complete || !resultText.trim()) {
    throw new Error("O servidor encerrou o streaming antes de concluir a resposta.");
  }
  return resultText;
}
