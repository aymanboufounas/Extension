'use strict';
/**
 * PyBMS Tools – VS Code companion for https://github.com/aymanboufounas/Pybms
 * No background telemetry, no remote AI, and no execution of documents during syntax checks.
 */
const vscode = require('vscode');
const cp = require('child_process');
const fs = require('fs');
const path = require('path');
const {catalog, groups, map} = require('./catalog');
const {templates} = require('./templates');

const REPO = 'https://github.com/aymanboufounas/Pybms';
const ZIP_URL = `${REPO}/archive/refs/heads/main.zip`;
const PY_SYNTAX = `import sys,json,ast
s=sys.stdin.read()
try:
 ast.parse(s)
 print(json.dumps({'valid':True,'error':None}))
except SyntaxError as e:
 print(json.dumps({'valid':False,'error':e.msg,'line':e.lineno,'offset':e.offset}))`;
const PY_REPAIR = `import json,sys
try:
 import pybms as pb
 repair=pb.fix_syntax(sys.stdin.read())
 print(json.dumps({'source':repair.source,'valid':repair.valid,'changes':repair.changes,'error':repair.error}))
except Exception as exc:
 print(json.dumps({'failed':str(exc),'type':type(exc).__name__}))`;
const PY_ENV = `import json,sys,importlib.util
r={'python':sys.executable,'version':sys.version.split()[0]}
try:
 import pybms
 r.update(installed=True,pybms_version=getattr(pybms,'__version__','unknown'),functions=len(pybms.list_functions()))
except Exception as exc:
 r.update(installed=False,error=str(exc))
print(json.dumps(r))`;

function config() { return vscode.workspace.getConfiguration('pybms'); }
function workspaceFolder(document) {
  if (document) return vscode.workspace.getWorkspaceFolder(document.uri);
  return vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0];
}
function interpreter(document) {
  const configured = config().get('pythonPath','python').trim() || 'python';
  if (configured !== 'python') return configured;
  const folder = workspaceFolder(document);
  if (folder) {
    for (const candidate of [path.join(folder.uri.fsPath,'.venv','Scripts','python.exe'),path.join(folder.uri.fsPath,'.venv','bin','python')]) {
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return configured;
}
function pybmsAliases(document) {
  const source = document.getText();
  const aliases = new Set();
  const importRe = /^\s*import\s+pybms(?:\s+as\s+([A-Za-z_]\w*))?/gm;
  let match;
  while ((match = importRe.exec(source))) aliases.add(match[1] || 'pybms');
  return aliases;
}
function usesPybms(document) {
  const source = document.getText();
  return /(?:^|\n)\s*(?:import\s+pybms\b|from\s+pybms\s+import\b)/.test(source);
}
function runPython(python, code, input, document) {
  // No shell: paths, code and source are separate argv/stdin values.
  return new Promise((resolve,reject)=>{
    const cwd = (workspaceFolder(document)?.uri.fsPath) || process.cwd();
    const child = cp.spawn(python,['-c',code],{cwd,windowsHide:true,stdio:['pipe','pipe','pipe']});
    let stdout='',stderr='',finished=false;
    const timer=setTimeout(()=>{
      if (!finished) { child.kill(); reject(new Error('Python operation timed out after 20 seconds.')); }
    },20000);
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data',value=>{stdout+=value;if(stdout.length>2_000_000) child.kill();});
    child.stderr.on('data',value=>{stderr+=value;if(stderr.length>200_000) child.kill();});
    child.on('error',err=>{finished=true;clearTimeout(timer);reject(err);});
    child.on('close',code=>{
      if(finished) return;
      finished=true; clearTimeout(timer);
      if(code!==0) return reject(new Error(stderr.trim()||`Python exited with code ${code}.`));
      try {
        const lines=stdout.trim().split(/\r?\n/);
        resolve(JSON.parse(lines[lines.length-1]));
      } catch(err) {reject(new Error('Unexpected Python response: '+stdout.slice(0,300)));}
    });
    child.stdin.on('error',()=>{});
    child.stdin.end(input||'');
  });
}
function verifiedDocument() {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId!=='python') {
    vscode.window.showWarningMessage('Open a Python file to use this PyBMS command.');
    return null;
  }
  return editor.document;
}
function makeTask(name, executable, args, document) {
  const folder=workspaceFolder(document);
  if(!folder){vscode.window.showWarningMessage('Open a folder or workspace first.');return;}
  const execution = new vscode.ProcessExecution(executable,args,{cwd:folder.uri.fsPath});
  const task = new vscode.Task({type:'pybms'},folder,name,'pybms',execution);
  task.presentationOptions={reveal:vscode.TaskRevealKind.Always,clear:false,panel:vscode.TaskPanelKind.Shared};
  return vscode.tasks.executeTask(task);
}
class CatalogTree {
  getTreeItem(item) {return item;}
  getChildren(item) {
    if (!item) return Object.entries(groups).map(([category,names])=>{
      const node=new vscode.TreeItem(category,vscode.TreeItemCollapsibleState.Collapsed);
      node.description=`${names.split(' ').length} functions`;
      node.contextValue='pybms-category';node.iconPath=new vscode.ThemeIcon('folder-library');
      node.category=category;return node;
    });
    return catalog.filter(e=>e.category===item.category).map(entry=>{
      const node = new vscode.TreeItem(entry.name,vscode.TreeItemCollapsibleState.None);
      node.description=entry.signature===`${entry.name}(...)`?'':entry.signature.replace(/^\w+/, '').slice(0,50);
      node.tooltip=`${entry.name}\n${entry.description}\n${entry.signature}`;
      node.contextValue='pybms-function';node.iconPath=new vscode.ThemeIcon('symbol-method');
      node.command={command:'pybms.showFunctionHelp',title:'PyBMS Help',arguments:[entry.name]};
      return node;
    });
  }
}
async function chooseEntry() {
  const selection=await vscode.window.showQuickPick(catalog.map(x=>({label:x.name,description:x.category,detail:x.description,entry:x})),{placeHolder:'Search all 100 PyBMS functions',matchOnDescription:true,matchOnDetail:true});
  return selection?.entry;
}
async function showFunctionHelp(name) {
  const entry = (typeof name==='string'&&map.get(name)) || await chooseEntry();
  if (!entry) return;
  const help=`# ${entry.name}\n\n**Category:** ${entry.category}\n\n${entry.description}\n\n\`\`\`python\n${entry.signature}\n\`\`\`\n\n## Example\n\n\`\`\`python\nimport pybms as pb\n${entry.example}\n\`\`\`\n\nFor the exact installed framework signature and full description, run:\n\n\`\`\`bash\npython -m pybms help ${entry.name}\n\`\`\`\n\n[Official PyBMS API Reference](${REPO}/blob/main/docs/API_REFERENCE.md)\n`;
  const document=await vscode.workspace.openTextDocument({language:'markdown',content:help});
  await vscode.window.showTextDocument(document,{preview:true,viewColumn:vscode.ViewColumn.Beside});
}
async function insertFunction() {
  const editor=vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId!=='python') return vscode.window.showWarningMessage('Open a Python editor first.');
  const entry=await chooseEntry();if(!entry) return;
  const aliases=pybmsAliases(editor.document);
  const alias = aliases.has('pb')?'pb':aliases.values().next().value || 'pb';
  if(!aliases.size) {
    const answer=await vscode.window.showInformationMessage('No PyBMS import found. Add `import pybms as pb`?',{modal:true},'Add Import');
    if(answer!=='Add Import') return;
    await editor.edit(edit=>edit.insert(new vscode.Position(0,0),'import pybms as pb\n'));
  }
  await editor.insertSnippet(new vscode.SnippetString(`${alias}.${entry.name}($1)`));
}
async function pickTemplate(){
  const selection=await vscode.window.showQuickPick(templates.map(x=>({label:x.title,description:x.description,template:x})),{placeHolder:'Choose a PyBMS workflow recipe'});
  return selection?.template;
}
async function openExample() {
  const t=await pickTemplate(); if(!t)return;
  const doc=await vscode.workspace.openTextDocument({language:'python',content:t.source});
  await vscode.window.showTextDocument(doc);
}
async function insertRecipe() {
  const editor=vscode.window.activeTextEditor;
  if(!editor || editor.document.languageId!=='python')return openExample();
  const t=await pickTemplate();if(!t)return;
  await editor.insertSnippet(new vscode.SnippetString(t.source));
}
async function newProject() {
  const folder=workspaceFolder();
  if(!folder) return vscode.window.showWarningMessage('Open a folder in VS Code before creating a PyBMS starter project.');
  if(!vscode.workspace.isTrusted) return vscode.window.showWarningMessage('Trust the workspace before creating files.');
  const name=await vscode.window.showInputBox({prompt:'New PyBMS project folder name',value:'my-pybms-project',validateInput:v=>/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(v)?null:'Use letters, numbers, underscores and hyphens only.'});
  if(!name)return;
  const target=path.join(folder.uri.fsPath,name);
  if(fs.existsSync(target))return vscode.window.showErrorMessage('That project folder already exists. Nothing was overwritten.');
  const t=await pickTemplate();if(!t)return;
  try {
    await fs.promises.mkdir(target,{recursive:false});
    await Promise.all([
      fs.promises.writeFile(path.join(target,'requirements.txt'),`git+${REPO}.git\n`,'utf8'),
      fs.promises.writeFile(path.join(target,t.file),t.source,'utf8'),
      fs.promises.writeFile(path.join(target,'README.md'),`# ${name}\n\nStarter project for [PyBMS](${REPO}).\n\nRequires Python 3.10+ and Git.\n\n\`\`\`powershell\npython -m venv .venv\n.venv\\Scripts\\python -m pip install -r requirements.txt\n.venv\\Scripts\\python ${t.file}\n\`\`\`\n\nLinux/macOS: use \`.venv/bin/python\` instead of \`.venv\\Scripts\\python\`.\nFor the CSV recipe, create \`data.csv\` and change the target column.\n`,'utf8')
    ]);
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(target,t.file))));
    vscode.window.showInformationMessage(`Created ${name} with ${t.file}, requirements.txt and README.md.`);
  } catch(err){vscode.window.showErrorMessage('Could not create project: '+err.message);}
}
async function install() {
  if(!vscode.workspace.isTrusted)return vscode.window.showWarningMessage('Trust the workspace before running installation tasks.');
  const folder=workspaceFolder();if(!folder)return vscode.window.showWarningMessage('Open a workspace folder before installing.');
  const python=interpreter();
  const ok=await vscode.window.showWarningMessage(`Install or upgrade PyBMS from GitHub into ${python}? This runs pip and downloads dependencies.`,{modal:true},'Install');
  if(ok!=='Install')return;
  return makeTask('PyBMS: Install/Upgrade',python,['-m','pip','install','--upgrade',ZIP_URL]);
}
async function environment(output) {
  if(!vscode.workspace.isTrusted)return vscode.window.showWarningMessage('Trust the workspace to check its Python environment.');
  const document=vscode.window.activeTextEditor?.document;
  try {
    const env=await runPython(interpreter(document),PY_ENV,'',document);
    output.appendLine('=== PyBMS Environment ===');
    output.appendLine(JSON.stringify(env,null,2));output.show(true);
    if(!env.installed){
      const action=await vscode.window.showWarningMessage('PyBMS is not available in this Python interpreter.','Install PyBMS');
      if(action==='Install PyBMS')await install();
    } else vscode.window.showInformationMessage(`PyBMS ${env.pybms_version} available — ${env.functions} workflows.`);
  }catch(err){vscode.window.showErrorMessage('Python check failed: '+err.message);}
}
async function runFile() {
  const document=verifiedDocument();if(!document)return;
  if(!vscode.workspace.isTrusted)return vscode.window.showWarningMessage('Trust the workspace before running Python.');
  if(document.isUntitled){return vscode.window.showWarningMessage('Save the Python file first.');}
  if(document.isDirty){await document.save();}
  return makeTask('PyBMS: Run '+path.basename(document.fileName),interpreter(document),['-u',document.fileName],document);
}
async function checkSyntax(document,diagnostics,showMessage=true) {
  if(!document){document=verifiedDocument();if(!document)return;}
  if(!vscode.workspace.isTrusted){if(showMessage)vscode.window.showWarningMessage('Trust the workspace before running Python syntax checks.');return;}
  if(document.getText().length>500_000){if(showMessage)vscode.window.showWarningMessage('Syntax check is limited to files under 500 KB.');return;}
  const version=document.version;
  try {
    const result=await runPython(interpreter(document),PY_SYNTAX,document.getText(),document);
    if(document.isClosed || document.version!==version)return;
    if(result.valid){diagnostics.delete(document.uri);if(showMessage)vscode.window.showInformationMessage('Python syntax valid.');return;}
    const line=Math.min(Math.max(0,(result.line||1)-1),Math.max(0,document.lineCount-1));
    const length=document.lineAt(line).text.length;
    const start=Math.min(Math.max(0,(result.offset||1)-1),length);
    const diagnostic=new vscode.Diagnostic(new vscode.Range(line,start,line,Math.min(length,start+1)),result.error||'Invalid syntax',vscode.DiagnosticSeverity.Error);
    diagnostic.source='PyBMS Syntax';diagnostics.set(document.uri,[diagnostic]);
    if(showMessage) vscode.window.showWarningMessage(`Python syntax error on line ${line+1}: ${result.error}`);
  }catch(err){if(showMessage)vscode.window.showErrorMessage('Syntax check failed: '+err.message);}
}
async function fixSyntax(diagnostics,previewContent) {
  const document=verifiedDocument();if(!document)return;
  if(!vscode.workspace.isTrusted)return vscode.window.showWarningMessage('Trust the workspace before running PyBMS syntax repair.');
  const original=document.getText();
  if(original.length>500_000)return vscode.window.showWarningMessage('Syntax repair is limited to files under 500 KB.');
  const version=document.version;
  try {
    const result=await runPython(interpreter(document),PY_REPAIR,original,document);
    if(result.failed)throw new Error(result.failed);
    if(!result.valid)return vscode.window.showWarningMessage('PyBMS could not safely repair this syntax: '+JSON.stringify(result.error));
    if(result.source===original)return vscode.window.showInformationMessage('No PyBMS syntax changes suggested.');
    const preview=vscode.Uri.parse('pybms-preview:/proposed-'+encodeURIComponent(path.basename(document.fileName||'untitled.py'))+'?'+Date.now());
    previewContent.set(preview.toString(),result.source);
    await vscode.commands.executeCommand('vscode.diff',document.uri,preview,'PyBMS syntax fix — review proposed changes', {preview:true});
    const summary=result.changes.length?result.changes.join('\n'):'Review the proposed source changes.';
    const option=await vscode.window.showInformationMessage(`PyBMS suggested ${result.changes.length} change(s). Review the diff before applying.\n${summary.slice(0,400)}`,{modal:true},'Apply to Original');
    if(option!=='Apply to Original')return;
    if(document.version!==version || document.getText()!==original) return vscode.window.showWarningMessage('The source changed during review; repair was NOT applied. Retry on the new version.');
    const end=document.lineAt(document.lineCount-1).range.end;
    const edit=new vscode.WorkspaceEdit();edit.replace(document.uri,new vscode.Range(new vscode.Position(0,0),end),result.source);
    if(await vscode.workspace.applyEdit(edit)){
      diagnostics.delete(document.uri);
      vscode.window.showInformationMessage(`Applied ${result.changes.length} reviewed PyBMS syntax repair(s). Save the file when ready.`);
    }
  }catch(err){
    const choice=await vscode.window.showErrorMessage('PyBMS syntax repair requires PyBMS installed in the selected Python interpreter. '+err.message,'Install PyBMS');
    if(choice==='Install PyBMS')await install();
  }
}
function registerLanguage(context) {
  if(config().get('completions',true)) {
    context.subscriptions.push(vscode.languages.registerCompletionItemProvider({language:'python'}, {
      provideCompletionItems(document,position) {
        const prefix=document.lineAt(position.line).text.slice(0,position.character);
        const found=/\b([A-Za-z_]\w*)\.([A-Za-z_]\w*)?$/.exec(prefix);
        if(!found || !pybmsAliases(document).has(found[1]))return [];
        const start=position.character-(found[2]||'').length;
        const range=new vscode.Range(position.line,start,position.line,position.character);
        return catalog.map(e=>{
          const item=new vscode.CompletionItem(e.name,vscode.CompletionItemKind.Function);
          item.range=range;item.detail=`PyBMS · ${e.category}`;
          const markdown=new vscode.MarkdownString(`**${e.signature}**\n\n${e.description}\n\n[Full API Reference](${REPO}/blob/main/docs/API_REFERENCE.md)`);
          item.documentation=markdown;item.insertText=new vscode.SnippetString(`${e.name}($1)`);
          item.sortText=`0_${e.name}`;
          return item;
        });
      }
    },'.'));
  }
  context.subscriptions.push(vscode.languages.registerHoverProvider({language:'python'}, {
    provideHover(document,position) {
      const word=document.getWordRangeAtPosition(position);
      if(!word)return;
      const name=document.getText(word),entry=map.get(name);if(!entry)return;
      const line=document.lineAt(position.line).text, before=line.slice(0,word.start.character);
      const attribute=/([A-Za-z_]\w*)\.$/.exec(before);
      const imported=/^\s*from\s+pybms\s+import\s+(.*)$/gm;
      let direct=false,m;
      while((m=imported.exec(document.getText()))) if(m[1].split(',').some(v=>v.trim()===name || v.trim()==='*'))direct=true;
      if(!((attribute && pybmsAliases(document).has(attribute[1]))||direct))return;
      const md=new vscode.MarkdownString();
      md.appendCodeblock(entry.signature,'python');
      md.appendMarkdown(`${entry.description}\n\n**${entry.category}** · [Reference](${REPO}/blob/main/docs/API_REFERENCE.md)`);
      return new vscode.Hover(md,word);
    }
  }));
}
function activate(context) {
  const output=vscode.window.createOutputChannel('PyBMS');
  const diagnostics=vscode.languages.createDiagnosticCollection('pybms');
  const previewContent=new Map();
  const previewProvider=vscode.workspace.registerTextDocumentContentProvider('pybms-preview',{
    provideTextDocumentContent(uri){return previewContent.get(uri.toString())||'';}
  });
  const status=vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left,25);
  status.name='PyBMS Tools';status.text='$(beaker) PyBMS';status.tooltip='Open PyBMS Tools';status.command='pybms.getStarted';status.show();
  context.subscriptions.push(output,diagnostics,previewProvider,status,vscode.window.registerTreeDataProvider('pybms.catalog',new CatalogTree()));
  const cmd=(id,action)=>context.subscriptions.push(vscode.commands.registerCommand('pybms.'+id,action));
  cmd('getStarted',async()=>{
    const actions=[['Create starter project','pybms.newProject'],['Create example file','pybms.openExample'],['Insert recipe','pybms.insertRecipe'],['Search 100 functions','pybms.showFunctionHelp'],['Install/Upgrade PyBMS','pybms.install'],['Check environment','pybms.environment'],['Run current script','pybms.runFile'],['Check syntax','pybms.checkSyntax'],['Preview syntax repair','pybms.fixSyntax'],['Open documentation','pybms.openDocs']];
    const choice=await vscode.window.showQuickPick(actions.map(([label,id])=>({label,id})),{placeHolder:'What do you want to do with PyBMS?'});
    if(choice)await vscode.commands.executeCommand(choice.id);
  });
  cmd('newProject',newProject);
  cmd('openExample',openExample);
  cmd('insertRecipe',insertRecipe);
  cmd('insertFunction',insertFunction);
  cmd('showFunctionHelp',showFunctionHelp);
  cmd('install',install);
  cmd('environment',()=>environment(output));
  cmd('runFile',runFile);
  cmd('checkSyntax',()=>checkSyntax(undefined,diagnostics,true));
  cmd('fixSyntax',()=>fixSyntax(diagnostics,previewContent));
  cmd('openDocs',()=>vscode.env.openExternal(vscode.Uri.parse(`${REPO}/blob/main/docs/API_REFERENCE.md`)));
  registerLanguage(context);
  context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(doc=>{
    if(doc.languageId==='python' && config().get('enableSyntaxDiagnostics',true) && usesPybms(doc)){
      void checkSyntax(doc,diagnostics,false);
    }
  }));
  context.subscriptions.push(vscode.workspace.onDidCloseTextDocument(doc=>{
    diagnostics.delete(doc.uri);
    previewContent.delete(doc.uri.toString());
  }));
  output.appendLine('PyBMS Tools activated. Framework: '+REPO);
}
function deactivate() {}
module.exports={activate,deactivate};
