'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const path=require('path');
const pkg=require('../package.json');
test('package manifest references existing assets and all commands',()=>{
  assert.ok(fs.existsSync(path.join(__dirname,'..',pkg.main)));
  assert.ok(fs.existsSync(path.join(__dirname,'..',pkg.icon)));
  assert.ok(fs.existsSync(path.join(__dirname,'..',pkg.contributes.viewsContainers.activitybar[0].icon)));
  for(const c of pkg.contributes.commands) assert.match(c.command,/^pybms\./);
  assert.equal(new Set(pkg.contributes.commands.map(c=>c.command)).size,pkg.contributes.commands.length);
});
test('all referenced snippets are valid JSON',()=>{
  for(const item of pkg.contributes.snippets){
    const data=JSON.parse(fs.readFileSync(path.join(__dirname,'..',item.path),'utf8'));
    assert.ok(Object.keys(data).length>=5);
  }
});
