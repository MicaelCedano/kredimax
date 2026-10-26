import { readFileSync } from "node:fs";
import ts from "typescript";

const options = { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 };
const asModuleUrl = (source) => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, { compilerOptions: options }).outputText).toString("base64")}`;
const policyUrl = asModuleUrl(readFileSync(new URL("../src/modules/financing/term-policy.ts", import.meta.url), "utf8"));
const calculatorSource = readFileSync(new URL("../src/modules/financing/calculator.ts", import.meta.url), "utf8")
  .replace('"@/modules/financing/term-policy"', JSON.stringify(policyUrl));

export const financingCalculator = await import(asModuleUrl(calculatorSource));
