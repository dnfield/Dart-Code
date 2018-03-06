"use strict";

import * as vs from "vscode";
import { FlutterWidgetItem } from "../views/flutter_outline_view";

export class FlutterOutlineCommands {
	constructor(context: vs.ExtensionContext) {
		const flutterOutlineCommands = [
			"_flutter.outline.refactor.flutter.wrap.center",
			"_flutter.outline.refactor.flutter.wrap.padding",
			"_flutter.outline.refactor.flutter.wrap.column",
			"_flutter.outline.refactor.flutter.move.up",
			"_flutter.outline.refactor.flutter.move.down",
			"_flutter.outline.refactor.flutter.removeWidget",
		];
		for (const cmd of flutterOutlineCommands) {
			const refactorId = cmd.replace("_flutter.outline.", "");
			context.subscriptions.push(
				vs.commands.registerCommand(cmd, (treeItem) => this.applyRefactoring(treeItem, refactorId)),
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
