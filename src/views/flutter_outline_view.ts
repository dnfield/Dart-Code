"use strict";

import * as vs from "vscode";
import * as as from "../analysis/analysis_server_types";
import { Analyzer } from "../analysis/analyzer";
import { isAnalyzable } from "../utils";

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
				return this.flutterOutline.outline.children.map((c) => new FlutterWidgetItem(c));
			} else {
				return [];
			}
		} else {
			return element.outline.children.map((c) => new FlutterWidgetItem(c));
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
	) {
		super(
			outline.label || outline.kind,
			outline.children && outline.children.length
				? vs.TreeItemCollapsibleState.Collapsed
				: vs.TreeItemCollapsibleState.None,
		);
	}

	public contextValue = "flutterWidget";
}
