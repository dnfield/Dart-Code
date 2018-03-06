"use strict";

import * as vs from "vscode";
import { FlutterWidgetItem } from "../views/flutter_outline_view";

export const flutterOutlineCommands = [
	"refactor.flutter.wrap.center",
	"refactor.flutter.wrap.padding",
	"refactor.flutter.wrap.column",
	"refactor.flutter.move.up",
	"refactor.flutter.move.down",
	"refactor.flutter.removeWidget",
];

export class FlutterOutlineCommands {
	constructor(context: vs.ExtensionContext) {
		for (const id of flutterOutlineCommands) {
			context.subscriptions.push(
				vs.commands.registerCommand("_flutter.outline." + id, (treeItem) => this.applyRefactoring(treeItem, id)),
			);
		}
	}

	private applyRefactoring(widget: FlutterWidgetItem, refactorType: string): void {
		// TODO: The .commands are missing here, see https://github.com/Microsoft/vscode/issues/45124
		throw Error("The .commands are missing here, see https://github.com/Microsoft/vscode/issues/45124");
		// const fix = widget.fixes.filter((f) => f.command).find((f) => f.kind.value.endsWith(refactorType));
		// if (fix) {
		// 	vs.commands.executeCommand(fix.command.command, fix.command.arguments);
		// } else {
		// 	console.error(`Unable to find command for Flutter Outline: ` + refactorType);
		// }
	}
}
