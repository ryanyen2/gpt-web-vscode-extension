import * as vscode from 'vscode';
import { Configuration, OpenAIApi } from "openai";
import GPTWebViewProvider from './webviewProvider';

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
	});

	const askGPT = vscode.commands.registerCommand('gpt-web.askGpt', async () => {
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
			console.log('Query: ' + query);
			vscode.commands.executeCommand("vscode.open", vscode.Uri.parse(query));
		}

	});


	context.subscriptions.push(view, textSelection, askGPT, webSearch);
}

// This method is called when your extension is deactivated
export function deactivate() { }
