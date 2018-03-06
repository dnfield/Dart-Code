"use strict";

import * as vs from "vscode";
import * as path from "path";
import * as as from "../analysis/analysis_server_types";
import { Analyzer } from "../analysis/analyzer";
import { isAnalyzable } from "../utils";
import { editor } from "../../test/helpers";
import { flutterOutlineCommands } from "../commands/flutter_outline";

const DART_SHOW_FLUTTER_OUTLINE = "dart-code:showFlutterOutline";
const DART_IS_WIDGET = "dart-code:isWidget";

export class FlutterOutlineProvider implements vs.TreeDataProvider<vs.TreeItem>, vs.Disposable {
	private subscriptions: vs.Disposable[] = [];
	private analyzer: Analyzer;
	private activeEditor: vs.TextEditor;
	private flutterOutline: as.FlutterOutlineNotification;
	private updateTimeout: NodeJS.Timer;
	private onDidChangeTreeDataEmitter: vs.EventEmitter<FlutterWidgetItem | undefined> = new vs.EventEmitter<FlutterWidgetItem | undefined>();
	public readonly onDidChangeTreeData: vs.Event<FlutterWidgetItem | undefined> = this.onDidChangeTreeDataEmitter.event;

	constructor(analyzer: Analyzer) {
		this.analyzer = analyzer;

		this.analyzer.registerForFlutterOutline((n) => {
			if (this.activeEditor && n.file === this.activeEditor.document.fileName) {
				this.flutterOutline = n;
				// Delay this so if we're getting lots of updates we don't flicker.
				clearTimeout(this.updateTimeout);
				this.updateTimeout = setTimeout(() => this.update(), 500);
			}
		});

		this.subscriptions.push(vs.window.onDidChangeActiveTextEditor((e) => this.setTrackingFile(e)));
		if (vs.window.activeTextEditor)
			this.setTrackingFile(vs.window.activeTextEditor);
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

	public refresh(): void {
		this.onDidChangeTreeDataEmitter.fire();
	}

	public getTreeItem(element: FlutterWidgetItem): vs.TreeItem {
		return element;
	}

	public async getChildren(element?: FlutterWidgetItem): Promise<vs.TreeItem[]> {
		const outline = element ? element.outline : this.flutterOutline ? this.flutterOutline.outline : null;
		const children: vs.TreeItem[] = [];

		if (outline) {
			if (outline.children && outline.length) {
				for (const c of outline.children) {
					const pos = this.activeEditor.document.positionAt(c.offset);
					const range = new vs.Range(pos, pos);
					const fixes = (await vs.commands.executeCommand(
						"vscode.executeCodeActionProvider",
						this.activeEditor.document.uri,
						range,
					)) as Array<vs.Command | vs.CodeAction>;
					const codeActionFixes =
						fixes
							.filter((f): f is vs.CodeAction => f instanceof vs.CodeAction)
							.filter((ca) => ca.kind && ca.kind.value);
					children.push(new FlutterWidgetItem(c, codeActionFixes, this.activeEditor));
				}
			}
			if (outline.attributes && outline.attributes.length)
				outline.attributes.map((a) => new FlutterWidgetAttributeItem(a)).forEach((a) => children.push(a));
		}

		return children;
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

export class FlutterWidgetItem extends vs.TreeItem {
	constructor(
		public readonly outline: as.FlutterOutline,
		public readonly fixes: vs.CodeAction[],
		editor: vs.TextEditor,
	) {
		super(
			FlutterWidgetItem.getLabel(outline),
			(outline.children && outline.children.length) || (outline.attributes && outline.attributes.length)
				? vs.TreeItemCollapsibleState.Collapsed
				: vs.TreeItemCollapsibleState.None,
		);

		this.command = {
			arguments: [{
				at: "top",
				lineNumber: editor.document.positionAt(outline.offset).line,
			}],
			command: "revealLine",
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
			this.contextValue = DART_IS_WIDGET + ":--" + refactorData + "--.dart";
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

class FlutterWidgetAttributeItem extends vs.TreeItem {
	constructor(public readonly attribute: as.FlutterOutlineAttribute) {
		super(attribute.name + ": " + attribute.label);
	}
}
