export class ToolExecutionError extends Error {
  constructor(message, code = "tool_execution_error") {
    super(message);
    this.name = "ToolExecutionError";
    this.code = code;
  }
}
