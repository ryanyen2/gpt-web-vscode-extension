import * as vscode from 'vscode';
import { ChatOpenAI } from "langchain/chat_models/openai";
import {
    ChatPromptTemplate,
    HumanMessagePromptTemplate,
    SystemMessagePromptTemplate,
    MessagesPlaceholder,
} from "langchain/prompts";
import { BufferMemory } from "langchain/memory";
import { ConversationChain } from "langchain/chains";


export default class GPTWebViewProvider implements vscode.WebviewViewProvider {
    // public static readonly viewType = 'gpt-web.chatView';
    private _chain: ConversationChain | undefined;

    private webView?: vscode.WebviewView;
    private _response?: string;
    public inProgress = false;
    private currentMessageId: string = "";
    private _questionCounter = 0;
    // private abortController?: AbortController;
    // private handler: MyCallbackHandler = new MyCallbackHandler();

    private _searchEngine: string = vscode.workspace.getConfiguration('gpt-web').get('searchEngine') + "";
    


    constructor(private context: vscode.ExtensionContext) {
        // const model = vscode.workspace.getConfiguration('gpt-web').get('models') + "";
        this.prepareNewChat();
    }

    private prepareNewChat() {
        const chat = new ChatOpenAI({
            modelName: "gpt-3.5-turbo",
            openAIApiKey: vscode.workspace.getConfiguration('gpt-web').get('ApiKey'),
            temperature: 0.5,
        });

        const chatPtompt = ChatPromptTemplate.fromPromptMessages([
            SystemMessagePromptTemplate.fromTemplate(
                "You are a highly intelligent AI chatbot that has deep understanding of any programming labguage and its API documentations. I might provide you with a code block≤ and your role is to provide a comprehensive answer to any questions or requests that I will ask about the code block. Please answer in as short as possible and not be limited to brevity. It is very important that you provide accurate answers and answer in markdown format."
            ),
            new MessagesPlaceholder("history"),
            HumanMessagePromptTemplate.fromTemplate("{input}"),
        ]);

        this._chain = new ConversationChain({
            memory: new BufferMemory({ returnMessages: true, memoryKey: "history" }),
            prompt: chatPtompt,
            llm: chat,
            verbose: false,
        });
    }

    public resolveWebviewView(webviewView: vscode.WebviewView, context: vscode.WebviewViewResolveContext, _token: vscode.CancellationToken) {
        this.webView = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.context.extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'askQuestion':
                    this.askGPT(data.value);
                    break;
                case 'openSettings':
                    vscode.commands.executeCommand('workbench.action.openSettings', "gpt-web.ApiKey");
                    break;
                case 'openSearchSettings':
                    vscode.commands.executeCommand('workbench.action.openSettings', "gpt-web.searchEngine");
                    break;

                case 'clearConversation':
                    this.resetConversation();
                    break;
                case 'stopGenerating':
                    this.stopGenerating();
                    break;
            }
        });
    }

    private logEvent(eventName: string, properties?: {}): void {
        // You can initialize your telemetry reporter and consume it here - *replaced with console.debug to prevent unwanted telemetry logs
        // this.reporter?.sendTelemetryEvent(eventName, { ... }, { ... });
        console.debug(eventName, {
            "gpt-web.searchEngine": this._searchEngine,
            "gpt-web.model": "gpt-3.5-turbo",
        }, { "gpt-web.questionCounter": this._questionCounter });
    }

    private logError(eventName: string): void {
        // You can initialize your telemetry reporter and consume it here - *replaced with console.error to prevent unwanted telemetry logs
        // this.reporter?.sendTelemetryEvent(eventName, { ... }, { ... });
        console.error(eventName, {
            "gpt-web.searchEngine": this._searchEngine,
            "gpt-web.model": "gpt-3.5-turbo",
        }, { "gpt-web.questionCounter": this._questionCounter });
    }

    public async askGPT(question: string) {
        if (this.inProgress) {
            return;
        }

        this._questionCounter++;
        const codeBlock = await this._getCodeBlock().catch((err) => {
            console.log('err: ', err);
            return '';
        });

        let questionPrompt = question.trim();
        if (questionPrompt.length === 0) {
            return;
        }

        questionPrompt = await this.processQuestion(questionPrompt, codeBlock);

        if (this.webView == null) {
            vscode.commands.executeCommand('gpt-web.chatView.focus');
        } else {
            this.webView.show(true);
        }

        this.inProgress = true;
        this.sendMessage({ type: 'showInProgress', inProgress: this.inProgress });

        this.currentMessageId = this.getRandomId();
        this.sendMessage({
            type: 'addQuestion',
            value: {
                question: question.trim(),
                codeBlock: codeBlock,
            }
        })

        // this.abortController = new AbortController();
        const response = await this._chain?.call({ input: questionPrompt }).catch(error => {
            let message;
            let apiMessage = error?.response?.data?.error?.message || error?.tostring?.() || error?.message || error?.name;

            if (error?.response?.status || error?.response?.statusText) {
                message = `${error?.response?.status || ""} ${error?.response?.statusText || ""}`;

                vscode.window.showErrorMessage("An error occured. If this is due to max_token you could try `ChatGPT: Clear Conversation` command and retry sending your prompt.", "Clear conversation and retry").then(async choice => {
                    if (choice === "Clear conversation and retry") {
                        console.log("Clearing conversation and retrying...");
                        // await vscode.commands.executeCommand("gpt-web.clearConversation");
                        // await delay(250);
                        // this.sendApiRequest(prompt, { command: options.command, code: options.code });
                    }
                });
            } else if (error.statusCode === 400) {
                message = `Your login method and your model may be incompatible or one of your parameters is unknown. Reset your settings to default. (HTTP 400 Bad Request)`;

            } else if (error.statusCode === 401) {
                message = 'Make sure you are properly signed in. If you are using Browser Auto-login method, make sure the browser is open (You could refresh the browser tab manually if you face any issues, too). If you stored your API key in settings.json, make sure it is accurate. If you stored API key in session, you can reset it with `ChatGPT: Reset session` command. (HTTP 401 Unauthorized) Potential reasons: \r\n- 1.Invalid Authentication\r\n- 2.Incorrect API key provided.\r\n- 3.Incorrect Organization provided. \r\n See https://platform.openai.com/docs/guides/error-codes for more details.';
            } else if (error.statusCode === 403) {
                message = 'Your token has expired. Please try authenticating again. (HTTP 403 Forbidden)';
            } else if (error.statusCode === 404) {
                message = `Your login method and your model may be incompatible or you may have exhausted your ChatGPT subscription allowance. (HTTP 404 Not Found)`;
            } else if (error.statusCode === 429) {
                message = "Too many requests try again later. (HTTP 429 Too Many Requests) Potential reasons: \r\n 1. You exceeded your current quota, please check your plan and billing details\r\n 2. You are sending requests too quickly \r\n 3. The engine is currently overloaded, please try again later. \r\n See https://platform.openai.com/docs/guides/error-codes for more details.";
            } else if (error.statusCode === 500) {
                message = "The server had an error while processing your request, please try again. (HTTP 500 Internal Server Error)\r\n See https://platform.openai.com/docs/guides/error-codes for more details.";
            }

            if (apiMessage) {
                message = `${message ? message + " " : ""}

	${apiMessage}
`;
            }

            this.sendMessage({ type: 'addError', value: message });

            return;
        });
        this._response = response?.response;
        this.sendMessage({
            type: 'addResponse',
            value: this._response,
            id: this.currentMessageId
        });

        // remove the text selection
        const editor = vscode.window.activeTextEditor;
        if (editor && !editor.selection.isEmpty) {
            // remove the text selection, show the cursor at the end of the selection
            editor.selection = new vscode.Selection(editor.selection.end, editor.selection.end);
        }

        this.inProgress = false;
        this.sendMessage({ type: 'showInProgress', inProgress: this.inProgress });
    }

    private async processQuestion(questionPrompt: string, codeBlock: string): Promise<string> {
        const languageId = vscode.window.activeTextEditor?.document.languageId || "javascript";
        questionPrompt = `${questionPrompt} ${codeBlock ? `(The question refer to the code in ${languageId}: \n${codeBlock})` : ''}`;

        return questionPrompt + '\r\n';
    }

    public async resetConversation() {
        this._questionCounter = 0;
        this.prepareNewChat();
    }

    private stopGenerating() {
        this.inProgress = false;
        this.sendMessage({ type: 'showInProgress', inProgress: this.inProgress });
    }

    private _getCodeBlock(): Promise<string> {
        return new Promise((resolve, reject) => {
            const editor = vscode.window.activeTextEditor;
            if (editor && !editor.selection.isEmpty) {
                const selection = editor.selection;
                const code = editor.document.getText(selection);
                resolve(code);
            } else {
                reject();
            }
        });
    }


    public sendMessage(message: any) {
        if (this.webView) {
            this.webView.webview.postMessage(message);
        }
    }


    private _getHtmlForWebview(webview: vscode.Webview) {
        const extesionUri = this.context.extensionUri;

        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extesionUri, 'media', 'main.js'));
        const stylesMainUri = webview.asWebviewUri(vscode.Uri.joinPath(extesionUri, 'media', 'main.css'));

        const vendorHighlightCss = webview.asWebviewUri(vscode.Uri.joinPath(extesionUri, 'media', 'vendor', 'highlight.min.css'));
        const vendorHighlightJs = webview.asWebviewUri(vscode.Uri.joinPath(extesionUri, 'media', 'vendor', 'highlight.min.js'));
        const vendorMarkedJs = webview.asWebviewUri(vscode.Uri.joinPath(extesionUri, 'media', 'vendor', 'marked.min.js'));
        const vendorTailwindJs = webview.asWebviewUri(vscode.Uri.joinPath(extesionUri, 'media', 'vendor', 'tailwindcss.3.2.4.min.js'));
        const vendorTurndownJs = webview.asWebviewUri(vscode.Uri.joinPath(extesionUri, 'media', 'vendor', 'turndown.js'));

        const nonce = this.getRandomId();

        return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0" data-license="isc-gnc">

				<link href="${stylesMainUri}" rel="stylesheet">
				<link href="${vendorHighlightCss}" rel="stylesheet">
				<script src="${vendorHighlightJs}"></script>
				<script src="${vendorMarkedJs}"></script>
				<script src="${vendorTailwindJs}"></script>
				<script src="${vendorTurndownJs}"></script>
			</head>
			<body class="overflow-hidden">
				<div class="flex flex-col h-screen">
					<div id="introduction" class="flex flex-col justify-between h-full justify-center px-6 w-full relative login-screen overflow-auto">
						<div data-license="isc-gnc-hi-there" class="flex items-start text-center features-block my-5">
							<div class="flex flex-col gap-3.5 flex-1">
								<h2>Features</h2>
								<ul class="flex flex-col gap-3.5 text-xs">
									<li class="features-li w-full border border-zinc-700 p-3 rounded-md">Improve your code, add tests & find bugs</li>
									<li class="features-li w-full border border-zinc-700 p-3 rounded-md">Copy or create new files automatically</li>
									<li class="features-li w-full border border-zinc-700 p-3 rounded-md">Syntax highlighting with auto language detection</li>
								</ul>
							</div>
						</div>
                        <div class="flex flex-col gap-4 h-full items-center justify-end text-center">
							<button id="list-conversations-link" class="hidden mb-4 btn btn-primary flex gap-2 justify-center p-3 rounded-md" title="You can access this feature via the kebab menu below. NOTE: Only available with Browser Auto-login method">
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" /></svg>&nbsp;Show conversations
							</button>
							<p class="max-w-sm text-center text-xs text-slate-500">
								<a title="" id="settings-button" href="#">Update settings</a>&nbsp; | &nbsp;<a title="" id="search-setting-button" href="#">Web Search Settings</a>
							</p>
						</div>
					</div>

					<div class="flex-1 overflow-y-auto" id="qa-list" data-license="isc-gnc"></div>

					<div class="flex-1 overflow-y-auto hidden" id="conversation-list" data-license="isc-gnc"></div>

					<div id="in-progress" class="pl-4 pt-2 flex items-center hidden" data-license="isc-gnc">
						<div class="typing">Thinking</div>
						<div class="spinner">
							<div class="bounce1"></div>
							<div class="bounce2"></div>
							<div class="bounce3"></div>
						</div>
					</div>

					<div class="p-4 flex items-center pt-2" data-license="isc-gnc">
						<div class="flex-1 textarea-wrapper">
							<textarea
								type="text"
								rows="1" data-license="isc-gnc"
								id="question-input"
								placeholder="Ask a question..."
								onInput="this.parentNode.dataset.replicatedValue = this.value"></textarea>
						</div>
						<div id="chat-button-wrapper" class="absolute bottom-14 items-center more-menu right-8 border border-gray-200 shadow-xl hidden text-xs" data-license="isc-gnc">
							<button class="flex gap-2 items-center justify-start p-2 w-full" id="clear-button"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>&nbsp;New chat</button>	
							<button class="flex gap-2 items-center justify-start p-2 w-full" id="settings-button"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" /><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>&nbsp;Update settings</button>
						</div>
						<div id="question-input-buttons" class="right-6 absolute p-0.5 ml-5 flex items-center gap-2">
							<button id="more-button" title="More actions" class="rounded-lg p-0.5" data-license="isc-gnc">
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z" /></svg>
							</button>

							<button id="ask-button" title="Submit prompt" class="ask-button rounded-lg p-0.5">
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5"><path stroke-linecap="round" stroke-linejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" /></svg>
							</button>
						</div>
					</div>
				</div>

				<script nonce="${nonce}" src="${scriptUri}"></script>
			</body>
			</html>`;
    }


    private getRandomId() {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }

    public setContextSelection(selection: vscode.Selection) {
        // console.log("setContextSelection", selection);
        this.webView?.webview.postMessage({
            type: 'setSelection',
            value: selection
        });
    }
}