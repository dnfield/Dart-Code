"use strict";

import * as vs from "vscode";
import * as as from "../analysis/analysis_server_types";
import { Analyzer } from "../analysis/analyzer";
import { isAnalyzable } from "../utils";
import { editor } from "../../test/helpers";

const DART_SHOW_FLUTTER_OUTLINE = "dart-code:showFlutterOutline";

export class FlutterOutlineProvider implements vs.TreeDataProvider<FlutterWidgetItem>, vs.Disposable {
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

	public getChildren(element?: FlutterWidgetItem): FlutterWidgetItem[] {
		if (!element) {
			if (this.flutterOutline && this.flutterOutline.outline && this.flutterOutline.outline.children && this.flutterOutline.outline.length) {
				return this.flutterOutline.outline.children.map((c) => new FlutterWidgetItem(c, this.activeEditor));
			} else {
				return [];
			}
		} else {
			return element.outline.children.map((c) => new FlutterWidgetItem(c, this.activeEditor));
		}
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

class FlutterWidgetItem extends vs.TreeItem {
	constructor(
		public readonly outline: as.FlutterOutline,
		editor: vs.TextEditor,
	) {
		super(
			FlutterWidgetItem.getLabel(outline),
			outline.children && outline.children.length
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
	}

	public contextValue = "flutterWidget";

	private static getLabel(outline: as.FlutterOutline): string {
		let label = "";

		if (outline.dartElement)
			label += " " + outline.dartElement.name;

		if (outline.variableName)
			label += " " + outline.variableName;

		if (outline.label)
			label += " " + outline.label;

		if (outline.attributes) {
			// According to
			// https://github.com/flutter/flutter-intellij/blob/d2bc014be391575b610be1af9dc9308127ce3826/src/io/flutter/preview/PreviewView.java#L1063
			// we can hide the attribute names for text/icon if it's the sole attribute
			if (outline.attributes.length === 1 && (outline.attributes[0].name === "text" || outline.attributes[0].name === "icon"))
				label += " " + outline.attributes[0].label;
			else
				label += " " + outline.attributes.map((a) => a.name + ": " + a.label).join(", ");
		}

		return label.trim();
	}
}
