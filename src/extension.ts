import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Configuration, OpenAIApi } from "openai";
import GPTWebViewProvider from './webviewProvider';

import { LogType, setLogFilePath, logUserEvent, logTerminalEvent, logTextChanges, logTextSelections } from './logger';

let openai: OpenAIApi | undefined;

export async function showInputBox() {
	const result = await vscode.window.showInputBox({
		ignoreFocusOut: true,
		placeHolder: 'Your OpenAI API Key',
		title: 'gpt-web API Key',
		prompt: 'You have not set your OpenAI API key yet or your API key is incorrect, please enter your API key to use the gpt-web extension.',
		validateInput: async text => {
			vscode.window.showInformationMessage(`Validating: ${text}`);
			if (text === '') {
				return 'The API Key can not be empty';
			}
			try {
				openai = new OpenAIApi(new Configuration({
					apiKey: text,
				}));
				await openai.listModels();
			} catch (err) {
				return 'Your API key is invalid';
			}
			return null;
		}
	});
	vscode.window.showInformationMessage(`Got: ${result}`);
	// Write to user settings
	await vscode.workspace.getConfiguration('gpt-web').update('ApiKey', result, true);
	// Write to workspace settings
	//await vscode.workspace.getConfiguration('gpt-web').update('ApiKey', result, false);
	return result;
}


//  web search query box
export async function showSearchQueryBox(input: string): Promise<string | undefined> {
	logUserEvent(LogType.WebSearch, 'onShowSearchQueryBox', 'openSearchQueryBox', input.trim());
	const result = await vscode.window.showInputBox({
		ignoreFocusOut: true,
		placeHolder: 'Search Query...',
		title: 'gpt-web search',
		prompt: 'Enter your search query fot the web search.',
		value: input
	});
	return result;
}


export async function activate(context: vscode.ExtensionContext) {

	if (vscode.workspace.getConfiguration('gpt-web').get('ApiKey') === "") {
		const apiKey = await showInputBox();
	}

	const provider = new GPTWebViewProvider(context);

	const view = vscode.window.registerWebviewViewProvider(
		'gpt-web.chatView',
		provider,
		{
			webviewOptions: {
				retainContextWhenHidden: true,
			}
		}
	)


	const textSelection = vscode.window.onDidChangeTextEditorSelection(e => {
		provider.setContextSelection(e.selections[0]);

		if (!e.selections[0].isEmpty) {
			logTextSelections(e);
		}
	});

	const askGPT = vscode.commands.registerCommand('gpt-web.askGpt', async () => {
		// logChatGPTEvent(LogType.AddRequest, "askGPT", questionPrompt);
		vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: "Generating AI response...",
			cancellable: true
		}, async () => {
			await provider.askGPT('Explain the code');
		});
	});


	const webSearch = vscode.commands.registerCommand('gpt-web.webSearch', async () => {
		let textSelection = vscode.window.activeTextEditor?.document.getText(vscode.window.activeTextEditor?.selection);
		textSelection = textSelection?.replace(/\n/g, ' ');

		if (!textSelection) {
			vscode.window.showInformationMessage('No text selected');
			return;
		}

		const languageID = vscode.window.activeTextEditor?.document.languageId
		const query = `${textSelection} ${languageID}`

		let userSearchQuery = await showSearchQueryBox(query)
		if (userSearchQuery) {
			const uriText = encodeURI(`${userSearchQuery}`);
			const queryTemplate = vscode.workspace.getConfiguration('gpt-web').get('queryPrefix') as string;
			const query = queryTemplate.replace("%SELECTION%", uriText);
			// console.log('Query: ' + query);
			logUserEvent(LogType.WebSearch, 'onWebSearch', 'webSearch', query);

			vscode.commands.executeCommand("vscode.open", vscode.Uri.parse(query));
		}

	});

	// log user vscode actions
	// https://code.visualstudio.com/api/references/vscode-api
	// const logUserAction = vscode.commands.registerCommand('extension.logUserAction:start', () => {
	// 	// Create log file for this user
	// 	// const logFolderPath = '/Users/r4yen/Desktop/Research/SearchNGen/logs';
	// });

	const outputDir = path.join(...(vscode.workspace.getConfiguration('gpt-web').get('outputDirectory') as string)
		.split(path.sep)
		.map(entry => entry === '~'
			? (process.env['HOME'] || '.')
			: entry)
	)
	if (!fs.existsSync(outputDir)) {
		fs.mkdirSync(outputDir, { recursive: true });
	}

	// store in json
	const logFileName = `log_${new Date()
		.toLocaleString()
		.replace(/\//g, "-")
		.replace(/,/g, "")
		.replace(/:/g, "-")
		.replace(/ /g, "_")}.txt`;


	console.log("Logging user actions to: " + logFileName);
	setLogFilePath(path.join(outputDir, logFileName));

	// Watch for text input events
	vscode.workspace.onDidChangeTextDocument((event: vscode.TextDocumentChangeEvent) => {
		// const { document, reason }: { document: vscode.TextDocument, reason: vscode.TextDocumentChangeReason } = event;
		const { document, reason } = event;
		let textDocumentChangeReason = 'unknown';
		if (reason === vscode.TextDocumentChangeReason.Undo) {
			textDocumentChangeReason = 'undo';
		} else if (reason === vscode.TextDocumentChangeReason.Redo) {
			textDocumentChangeReason = 'redo';
		}

		// text being changed
		const changed_text = event.contentChanges[0].text;
		
		logTextChanges(document, textDocumentChangeReason, event.contentChanges);
	}),

		// FILE EVENTS
		vscode.workspace.onDidCreateFiles((event: vscode.FileCreateEvent) => {
			const content = event.files[0].fsPath as string;
			logUserEvent(LogType.FileOperation, "onDidCreateFiles", content);
		}),
		vscode.workspace.onDidDeleteFiles((event: vscode.FileDeleteEvent) => {
			const content = event.files[0].fsPath;
			logUserEvent(LogType.FileOperation, "onDidDeleteFiles", content);
		}),


		// DOCUMENT EVENTS
		vscode.workspace.onDidOpenTextDocument((event: vscode.TextDocument) => {
			const { fileName, version, lineCount, languageId } = event;
			logUserEvent(LogType.DocumentState, "onDidOpenTextDocument", fileName, { version, lineCount, languageId });
		}),
		vscode.workspace.onDidCloseTextDocument((event: vscode.TextDocument) => {
			const { fileName, version, lineCount, languageId } = event;
			logUserEvent(LogType.DocumentState, "onDidCloseTextDocument", fileName, { version, lineCount, languageId });
		}),
		vscode.workspace.onDidSaveTextDocument((event: vscode.TextDocument) => {
			const { fileName, version, lineCount, languageId } = event;
			logUserEvent(LogType.DocumentState, "onDidSaveTextDocument", fileName, { version, lineCount, languageId });
		}),
		vscode.window.onDidChangeActiveTextEditor((event: vscode.TextEditor | undefined) => {
			const { document } = event as vscode.TextEditor;
			const { fileName, version, lineCount, languageId } = document;
			logUserEvent(LogType.DocumentState, "onDidChangeActiveTextEditor", fileName, { version, lineCount, languageId });
		}),


		// WINSOW EVENTS
		vscode.window.onDidChangeWindowState((event: vscode.WindowState) => {
			const content = event.focused ? "focused" : "unfocused";
			logUserEvent(LogType.WindowState, "onDidChangeWindowState", content);
		})

		// vscode.WebviewPanel.onDidChangeViewState((event: vscode.WebviewPanelOnDidChangeViewStateEvent) => 
		// vscode.WebViewProvider.onDidChangeViewState((event: vscode.WebviewPanelOnDidChangeViewStateEvent) => {

	// TERMINAL EVENTS
	vscode.window.onDidChangeTerminalState((event: vscode.Terminal) => {
		console.log(">>> Terminal State <<< ", event.state.isInteractedWith)
		const { name, processId, state } = event as vscode.Terminal;
		logTerminalEvent(LogType.TerminalState, "onDidChangeTerminalState", name, state.isInteractedWith, processId);
	})
	vscode.window.onDidOpenTerminal((event: vscode.Terminal) => {
		const { name, processId, state } = event as vscode.Terminal;
		logTerminalEvent(LogType.TerminalState, "onDidOpenTerminal", name, state.isInteractedWith, processId);
	})

	vscode.window.onDidCloseTerminal((event: vscode.Terminal) => {
		const { name, processId, state } = event as vscode.Terminal;
		logTerminalEvent(LogType.TerminalState, "onDidCloseTerminal", name, state.isInteractedWith, processId);
	})
	vscode.window.onDidChangeActiveTerminal((event: vscode.Terminal | undefined) => {
		const { name, processId, state } = event as vscode.Terminal;
		logTerminalEvent(LogType.TerminalState, "onDidChangeActiveTerminal", name, state.isInteractedWith, processId);
	})

	context.subscriptions.push(view, textSelection, askGPT, webSearch);
}

// This method is called when your extension is deactivated
export function deactivate() { }
