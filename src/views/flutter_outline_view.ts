"use strict";

import * as vs from "vscode";
import * as path from "path";
import * as as from "../analysis/analysis_server_types";
import { Analyzer } from "../analysis/analyzer";
import { isAnalyzable } from "../utils";
import { editor } from "../../test/helpers";
import { flutterOutlineCommands } from "../commands/flutter_outline";
import { extensionPath } from "../extension";

const DART_SHOW_FLUTTER_OUTLINE = "dart-code:showFlutterOutline";
const DART_IS_WIDGET = "dart-code:isWidget";

export class FlutterOutlineProvider implements vs.TreeDataProvider<FlutterWidgetItem>, vs.Disposable {
	private treeView: vs.TreeView<FlutterWidgetItem>;
	private subscriptions: vs.Disposable[] = [];
	private analyzer: Analyzer;
	private activeEditor: vs.TextEditor;
	private flutterOutline: as.FlutterOutlineNotification;
	private treeNodesByLine: { [key: number]: FlutterWidgetItem[]; } = [];
	private updateTimeout: NodeJS.Timer;
	private onDidChangeTreeDataEmitter: vs.EventEmitter<FlutterWidgetItem | undefined> = new vs.EventEmitter<FlutterWidgetItem | undefined>();
	public readonly onDidChangeTreeData: vs.Event<FlutterWidgetItem | undefined> = this.onDidChangeTreeDataEmitter.event;

	constructor(analyzer: Analyzer) {
		this.analyzer = analyzer;
		// TODO: Should we move this up? It's not really intended to be inside here (tree providers should
		// be usable for multiple trees).
		this.treeView = vs.window.createTreeView("flutter_outline_tree", { treeDataProvider: this });

		this.analyzer.registerForFlutterOutline((n) => {
			if (this.activeEditor && n.file === this.activeEditor.document.fileName) {
				this.flutterOutline = n;
				this.treeNodesByLine = [];
				// Delay this so if we're getting lots of updates we don't flicker.
				clearTimeout(this.updateTimeout);
				this.updateTimeout = setTimeout(() => this.update(), 200);
			}
		});

		this.subscriptions.push(vs.window.onDidChangeActiveTextEditor((e) => this.setTrackingFile(e)));
		if (vs.window.activeTextEditor) {
			this.setTrackingFile(vs.window.activeTextEditor);
		}

		this.subscriptions.push(vs.window.onDidChangeTextEditorSelection((e) => {
			if (e.selections && e.selections.length) {
				this.highlightNodeAt(e.selections[0].start);
			}
		}));
	}

	private update() {
		if (!this.flutterOutline || !this.activeEditor || this.flutterOutline.file !== this.activeEditor.document.fileName || !this.flutterOutline.outline || !this.flutterOutline.outline.children || this.flutterOutline.outline.children.length === 0) {
			FlutterOutlineProvider.hideTree();
			return;
		}

		FlutterOutlineProvider.showTree();
		this.refresh();
	}

	private setTrackingFile(editor: vs.TextEditor) {
		if (editor && isAnalyzable(editor.document)) {
			this.activeEditor = editor;
			this.flutterOutline = null;

			this.analyzer.forceNotificationsFor(editor.document.fileName);
		} else {
			FlutterOutlineProvider.hideTree();
			this.activeEditor = null;
		}
	}

	private highlightNodeAt(pos: vs.Position) {
		if (!this.treeNodesByLine[pos.line])
			return;

		const offset = this.activeEditor.document.offsetAt(pos);
		for (const item of this.treeNodesByLine[pos.line]) {
			if (item.outline.offset < offset
				&& item.outline.offset + item.outline.length > offset) {
				this.treeView.reveal(item);
				return;
			}
		}
	}

	public refresh(): void {
		this.onDidChangeTreeDataEmitter.fire();
	}

	public getTreeItem(element: FlutterWidgetItem): vs.TreeItem {
		return element;
	}

	public async getChildren(element?: FlutterWidgetItem): Promise<FlutterWidgetItem[]> {
		const outline = element ? element.outline : this.flutterOutline ? this.flutterOutline.outline : null;
		const children: FlutterWidgetItem[] = [];
		const editor = this.activeEditor;

		if (outline) {
			if (outline.children && outline.length) {
				for (const c of outline.children) {

					const canHaveFixes = isWidget(c);
					const fixes = canHaveFixes
						? await getFixes(editor, c)
						: [];
					// Ensure we're still active editor before trying to use.
					if (editor && editor.document && !editor.document.isClosed) {
						const codeActionFixes =
							fixes
								.filter((f): f is vs.CodeAction => f instanceof vs.CodeAction)
								.filter((ca) => ca.kind && ca.kind.value);
						const node = new FlutterWidgetItem(element, c, codeActionFixes, editor);
						children.push(node);
						// Add this node to a lookup by line so we can quickly find it as the user moves around the doc.
						const line = this.activeEditor.document.positionAt(c.offset).line;
						if (!this.treeNodesByLine[line]) {
							this.treeNodesByLine[line] = [];
						}
						this.treeNodesByLine[line].push(node);
					}
				}
			}
		}

		return children;
	}

	public getParent(element: FlutterWidgetItem): FlutterWidgetItem {
		return element.parent;
	}

	private static setTreeVisible(visible: boolean) {
		vs.commands.executeCommand("setContext", DART_SHOW_FLUTTER_OUTLINE, visible);
	}

	public static showTree() { this.setTreeVisible(true); }
	public static hideTree() { this.setTreeVisible(false); }

	public dispose() {
		this.activeEditor = null;
		this.subscriptions.forEach((s) => s.dispose());
	}
}

function isWidget(outline: as.FlutterOutline) {
	return outline.kind !== "DART_ELEMENT";
}

function getFixes(editor: vs.TextEditor, outline: as.FlutterOutline): Thenable<Array<vs.Command | vs.CodeAction>> {
	const pos = editor.document.positionAt(outline.offset);
	const range = new vs.Range(pos, pos);
	return vs.commands.executeCommand(
		"vscode.executeCodeActionProvider",
		editor.document.uri,
		range,
	);
}

export class FlutterWidgetItem extends vs.TreeItem {
	constructor(
		public readonly parent: FlutterWidgetItem,
		public readonly outline: as.FlutterOutline,
		public readonly fixes: vs.CodeAction[],
		editor: vs.TextEditor,
	) {
		super(
			FlutterWidgetItem.getLabel(outline),
			(outline.children && outline.children.length)
				? vs.TreeItemCollapsibleState.Expanded
				: vs.TreeItemCollapsibleState.None,
		);

		if (isWidget(outline)) {
			this.iconPath = path.join(extensionPath, "media/icons/flutter.svg");
		}

		this.command = {
			arguments: [
				editor,
				// Code to fit on screen
				new vs.Range(
					editor.document.positionAt(outline.offset),
					editor.document.positionAt(outline.offset + outline.length),
				),
				// Code to highlight
				new vs.Range(
					// TODO: Change to codeOffset/codeLength
					editor.document.positionAt(outline.offset),
					editor.document.positionAt(outline.offset + outline.length),
				),
				// Cursor position
				editor.document.positionAt((outline.dartElement ? outline.dartElement.location : outline).offset),
			],
			command: "_dart.showCode",
			title: "",
		};

		// Create a context value that is each item with a pipe at each side.
		const refactorData = this
			.fixes
			.map((ca) => ca.kind.value)
			.filter((c) => flutterOutlineCommands.indexOf(c) !== -1)
			.join("--");
		if (refactorData) {
			// So we can search by --ID--
			this.contextValue = DART_IS_WIDGET + ":--" + refactorData + "--";
		}

		this.tooltip = this.label;
		if (outline.attributes) {
			this.tooltip += "\n  " + outline.attributes.map((a) => `${a.name}: ${a.label}`).join("\n   ");
		}
	}

	private static getLabel(outline: as.FlutterOutline): string {
		let label = "";

		if (outline.dartElement) {
			label += " " + outline.dartElement.name;
			if (outline.dartElement.typeParameters)
				label += outline.dartElement.typeParameters;
			if (outline.dartElement.parameters)
				label += outline.dartElement.parameters;
			if (outline.dartElement.returnType)
				label += " → " + outline.dartElement.returnType;
		}

		if (outline.variableName)
			label += " " + outline.variableName;

		if (outline.className)
			label += " " + outline.className;

		if (outline.label)
			label += " " + outline.label;

		return label.trim();
	}
}
