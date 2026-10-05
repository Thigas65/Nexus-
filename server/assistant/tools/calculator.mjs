import { ToolExecutionError } from "./errors.mjs";

const maximumExpressionLength = 256;
const maximumTokens = 128;
const maximumDepth = 32;
const maximumResultMagnitude = 1e100;

function tokenize(expression) {
  if (typeof expression !== "string" || !expression.trim()) {
    throw new ToolExecutionError("Informe uma expressão matemática.", "invalid_parameter");
  }
  if (expression.length > maximumExpressionLength) {
    throw new ToolExecutionError("A expressão matemática excede o tamanho permitido.", "invalid_parameter");
  }

  const tokens = [];
  let offset = 0;
  while (offset < expression.length) {
    const remaining = expression.slice(offset);
    const whitespace = /^\s+/.exec(remaining);
    if (whitespace) {
      offset += whitespace[0].length;
      continue;
    }

    const number = /^(?:(?:\d+(?:[.,]\d*)?)|(?:[.,]\d+))/.exec(remaining);
    if (number) {
      if (number[0].includes(".") && number[0].includes(",")) {
        throw new ToolExecutionError("Use apenas um separador decimal na expressão.", "invalid_expression");
      }
      tokens.push({ type: "number", value: Number(number[0].replace(",", ".")) });
      offset += number[0].length;
    } else if (/^[()+\-*/%^]/.test(remaining)) {
      tokens.push({ type: remaining[0], value: remaining[0] });
      offset += 1;
    } else {
      throw new ToolExecutionError("A expressão contém caracteres ou operações não permitidos.", "invalid_expression");
    }

    if (tokens.length > maximumTokens) {
      throw new ToolExecutionError("A expressão contém operações demais.", "invalid_expression");
    }
  }
  return tokens;
}

export function evaluateExpression(expression) {
  const tokens = tokenize(expression);
  let position = 0;
  let depth = 0;

  function current() {
    return tokens[position];
  }

  function parsePrimary() {
    const token = current();
    if (token?.type === "number") {
      position += 1;
      return token.value;
    }
    if (token?.type === "(") {
      depth += 1;
      if (depth > maximumDepth) {
        throw new ToolExecutionError("A expressão está aninhada profundamente demais.", "invalid_expression");
      }
      position += 1;
      const value = parseAdditive();
      if (current()?.type !== ")") {
        throw new ToolExecutionError("A expressão contém parênteses incompletos.", "invalid_expression");
      }
      position += 1;
      depth -= 1;
      return value;
    }
    throw new ToolExecutionError("A expressão matemática não está completa.", "invalid_expression");
  }

  function parsePower() {
    const base = parsePrimary();
    if (current()?.type !== "^") return base;
    position += 1;
    return checkedResult(base ** parseUnary());
  }

  function parseUnary() {
    const token = current();
    if (token?.type === "+" || token?.type === "-") {
      position += 1;
      const value = parseUnary();
      return token.type === "-" ? -value : value;
    }
    return parsePower();
  }

  function parseMultiplicative() {
    let value = parseUnary();
    while (current()?.type === "*" || current()?.type === "/" || current()?.type === "%") {
      const operator = current().type;
      position += 1;
      const right = parseUnary();
      if ((operator === "/" || operator === "%") && right === 0) {
        throw new ToolExecutionError("Não é possível dividir por zero.", "division_by_zero");
      }
      value = checkedResult(
        operator === "*" ? value * right
          : operator === "/" ? value / right
            : value % right,
      );
    }
    return value;
  }

  function parseAdditive() {
    let value = parseMultiplicative();
    while (current()?.type === "+" || current()?.type === "-") {
      const operator = current().type;
      position += 1;
      const right = parseMultiplicative();
      value = checkedResult(operator === "+" ? value + right : value - right);
    }
    return value;
  }

  const result = parseAdditive();
  if (position !== tokens.length) {
    throw new ToolExecutionError("A expressão matemática contém sintaxe inválida.", "invalid_expression");
  }
  return checkedResult(result);
}

function checkedResult(value) {
  if (!Number.isFinite(value) || Math.abs(value) > maximumResultMagnitude) {
    throw new ToolExecutionError("O resultado está fora do intervalo permitido.", "result_out_of_range");
  }
  return value;
}

export function extractExpression(request) {
  return request
    .trim()
    .replace(/^(?:por favor,?\s*)?(?:calcule|calcular|calcula|resolva|resolve|quanto é|quanto dá|resultado de)\s*/i, "")
    .replace(/[?!.,;:]+$/g, "")
    .replace(/\bdividido\s+por\b/gi, "/")
    .replace(/\bvezes\b|\bx\b/gi, "*")
    .replace(/\bmais\b/gi, "+")
    .replace(/\bmenos\b/gi, "-")
    .trim();
}
