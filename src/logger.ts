import * as fs from 'fs';
import * as vscode from 'vscode';
import { TextDocumentContentChangeEvent, Selection, TextDocumentChangeEvent, TextEditorSelectionChangeEvent } from 'vscode';

/*
Log types:
  - chatgpt
    - addResponse
      - type of the response (code, text, etc.)
    - addRequest
      - prompt input
    - stop request
    - reset conversation
    - addEvent
    - clearResponses
    - setTask
    - setWorkingState
    - setConversationId
    - promptsLoaded
    - setContextSelection
    - ask
    - explain
    - refactor
    - optimize
    - documentation
    - completion
    - resetConversation
    - findProblems
  - chatgpt answer
    - insert
      - replace (if with selection)
      - new insert
    - delete
  - vscode
    - textChanges - code input (user input)
    - fileOperation - create/ open/ close/ delete file/ folder
    - windowState - focus/ blur editor (blur => debug/ search/ chat gpt)
    - textSelections - onDidChangeTextEditorSelection
    - focus/ blur terminal (user debugging)
    - focus/ blur extensions (use chat gpt)
    - load / unload webview
*/

export enum LogType {
  TextChanges = "textChanges",
  FileOperation = "fileOperation",
  WindowState = "windowState",
  TextSelections = "textSelections",
  AddResponse = "addResponse",
  AddRequest = "addRequest",
  WebSearch = "webSearch",
  TerminalState = "terminalState",
  DocumentState = "documentState",
}

interface ExtensionLog {
  logType: LogType;
  eventName: string;
  timestamp: number; // unix timestamp
}

interface UserEvent extends ExtensionLog {
  eventName: string;
  content: string | undefined;
  payload: any;
}

interface TextChange extends ExtensionLog {
  filename: string;
  contentChanges: readonly TextDocumentContentChangeEvent[];
  payload: any;
}

interface TextSelection extends ExtensionLog {
  filename: string;
  context: string;
  selections: readonly Selection[];
}

interface ChatGPTEvent extends ExtensionLog {
  content: string;
  hasCode: boolean | undefined;
}

interface TerminalEvent extends ExtensionLog {
  terminalName: string;
  isInteractedWithTerminal: boolean;
  processId: any;
}


let logFilePath: string;

export function setLogFilePath(path: string) {
  logFilePath = path;
  console.log("File>> ", logFilePath);
}

export function logChatGPTEvent(logType: LogType, eventName: string, content: string, hasCode?: boolean) {
  let logEntry: ChatGPTEvent = {
    logType,
		eventName,
		timestamp: Date.now(),
    content,
    hasCode,
  };
  const logFileContent = JSON.stringify(logEntry);
  console.log(logFileContent)
  fs.appendFileSync(logFilePath, logFileContent + "\r\n");
}


export function logTerminalEvent(logType: LogType, eventName: string, terminalName: string, isInteractedWithTerminal: boolean, processId?: any) {
  let logEntry: TerminalEvent = {
    logType,
    eventName,
    timestamp: Date.now(),
    terminalName,
    isInteractedWithTerminal,
    processId,
  };
  const logFileContent = JSON.stringify(logEntry);
  // console.log(logFileContent)
  fs.appendFileSync(logFilePath, logFileContent + "\r\n");
}

export function logUserEvent(logType: LogType, eventName: string, content?: string, payload?: any) {
  let logEntry: UserEvent = {
    logType,
		eventName,
		timestamp: Date.now(),
    content,
    payload,
  };
  const logFileContent = JSON.stringify(logEntry);
  // console.log(logFileContent)
  fs.appendFileSync(logFilePath, logFileContent + "\r\n");
}

export function logTextChanges(document: vscode.TextDocument, changeReason: string, contentChanges: readonly TextDocumentContentChangeEvent[]) {
  const { fileName, version, lineCount, languageId } = document;

  let logEntry: TextChange = {
    logType: LogType.TextChanges,
		timestamp: Date.now(),
    filename: fileName,
    contentChanges: contentChanges,
    eventName: changeReason,
    payload: {
      version,
      lineCount,
      languageId,
    }
  };
  const logFileContent = JSON.stringify(logEntry);
  // console.log(logFileContent);
  fs.appendFileSync(logFilePath, logFileContent + "\r\n");
}

export function logTextSelections(event: TextEditorSelectionChangeEvent) {

  const selectedText = event.textEditor.document.getText(event.selections[0]);
  if (selectedText.trim() === "" || selectedText.trim() === "\n" || selectedText.trim() === "\t") {
    return;
  } 
  const { kind }: { kind: vscode.TextEditorSelectionChangeKind | undefined } = event;
  let selectionType: string;
  if (kind === vscode.TextEditorSelectionChangeKind.Mouse) {
    selectionType = "mouse";
  } else if (kind === vscode.TextEditorSelectionChangeKind.Keyboard) {
    selectionType = "keyboard";
  } else {
    selectionType = "command";
  }

  let logEntry: TextSelection = {
    logType: LogType.TextSelections,
		eventName: selectionType,
		timestamp: Date.now(),
		filename: event.textEditor.document.fileName,
    selections: event.selections,
    context: event.textEditor.document.getText(event.selections[0]),
  };
  const logFileContent = JSON.stringify(logEntry);
  // console.log(logFileContent);

  fs.appendFileSync(logFilePath, logFileContent + "\r\n");
}