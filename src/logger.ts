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
  AddRequest = "addRequest"
}

interface ExtensionLog {
  logType: LogType;
  eventName: string;
  timestamp: number; // unix timestamp
}

interface UserEvent extends ExtensionLog {
  eventName: string;
  action: string | undefined;
  content: string | undefined;
}

interface TextChange extends ExtensionLog {
  filename: string;
  contentChanges: readonly TextDocumentContentChangeEvent[];
}

interface TextSelection extends ExtensionLog {
  filename: string;
  selections: readonly Selection[];
}

interface ChatGPTEvent extends ExtensionLog {
  content: string;
  hasCode: boolean | undefined;
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
  fs.appendFileSync(logFilePath, logFileContent);
}

export function logUserEvent(logType: LogType, eventName: string, action?: string, content?: string) {
  let logEntry: UserEvent = {
    logType,
		eventName,
		timestamp: Date.now(),
    action,
    content,
  };
  const logFileContent = JSON.stringify(logEntry);
  // console.log(logFileContent)
  fs.appendFileSync(logFilePath, logFileContent);
}

export function logTextChanges(event: TextDocumentChangeEvent) {
  // let contentChanges;
  // const textBeforeCursor = event.document.getText(
  //   new vscode.Range(
  //     event.document.positionAt(event.document.offsetAt(event.contentChanges[0].range.start) - 1),
  //     event.document.positionAt(event.document.offsetAt(event.contentChanges[0].range.start))
  //   )
  // );
  // const keyInput = event.contentChanges[0]
  // console.log('keyInput>> ', keyInput);
  // if (keyInput.text === " ") {
  // 	contentChanges = "space";
  // } else if (keyInput.text.includes("\n")) {
  // 	contentChanges = "enter";
  // } else if (keyInput.text.includes("\t")) {
  // 	contentChanges = "tab";
  // } else if (keyInput.text === "") {
  // 	contentChanges = "backspaces"
  // } else if (keyInput.text.length > 1) {
  // 	contentChanges = keyInput.text;
  // } 

  // if == '': new world, == '//': new command
  // if (textBeforeCursor === "") {
  // 	logTextChanges(event, "new world");
  // } else if (textBeforeCursor === "//") {
  // 	logTextChanges(event, "new command");
  // } else {
  // 	logTextChanges(event, "edit");
  // }
  let logEntry: TextChange = {
    logType: LogType.TextChanges,
		eventName: "onDidChangeTextDocument",
		timestamp: Date.now(),
		filename: event.document.fileName,
    contentChanges: event.contentChanges
  };
  const logFileContent = JSON.stringify(logEntry);
  // console.log(logFileContent);
  fs.appendFileSync(logFilePath, logFileContent);
}

export function logTextSelections(event: TextEditorSelectionChangeEvent) {
  let logEntry: TextSelection = {
    logType: LogType.TextSelections,
		eventName: "onDidChangeTextEditorSelection",
		timestamp: Date.now(),
		filename: event.textEditor.document.fileName,
    selections: event.selections
  };
  const logFileContent = JSON.stringify(logEntry);
  // console.log(logFileContent);
  fs.appendFileSync(logFilePath, logFileContent);
}