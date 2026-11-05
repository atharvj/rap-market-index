import { expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import ts from "typescript";

it("orders every exported table by columns that exist in the tracked schema", () => {
  const source = ts.createSourceFile("export.mjs",readFileSync("scripts/export-application-data.mjs","utf8"),ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
  const declarations = source.statements.filter(ts.isVariableStatement).flatMap(s=>s.declarationList.declarations);
  const tableList = declarations.find(d=>d.name.getText(source)==="tables")!.initializer as ts.ArrayLiteralExpression;
  const orderObject = declarations.find(d=>d.name.getText(source)==="TABLE_ORDER")!.initializer as ts.ObjectLiteralExpression;
  const orders = Object.fromEntries(orderObject.properties.filter(ts.isPropertyAssignment).map(p=>[
    p.name.getText(source), (p.initializer as ts.ArrayLiteralExpression).elements.map(e=>(e as ts.StringLiteral).text)
  ]));
  const schema = readdirSync("supabase/migrations").filter(f=>f.endsWith(".sql")).sort()
    .map(f=>readFileSync("supabase/migrations/"+f,"utf8")).join("\n");
  for(const item of tableList.elements){
    const table=(item as ts.StringLiteral).text;
    const definition=schema.match(new RegExp(`create table(?: if not exists)? public\\.${table} \\(([\\s\\S]*?)\\n\\);`))?.[1];
    expect(definition,table+" missing schema").toBeDefined();
    for(const column of orders[table]??["id"])expect(definition,table+" missing sort column "+column).toMatch(new RegExp(`\\n\\s+${column}\\s`));
  }
});
