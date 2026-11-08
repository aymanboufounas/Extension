'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {catalog,groups,map}=require('../src/catalog');
const {templates}=require('../src/templates');
test('catalog contains exactly 100 unique PyBMS workflows',()=>{
  assert.equal(catalog.length,100);
  assert.equal(new Set(catalog.map(e=>e.name)).size,100);
  assert.equal(map.size,100);
  for(const entry of catalog){assert.ok(groups[entry.category]);assert.ok(entry.description);assert.ok(entry.signature);assert.ok(entry.example);}
});
test('category counts match framework documentation',()=>{
  assert.deepEqual(Object.fromEntries(Object.keys(groups).map(k=>[k,catalog.filter(e=>e.category===k).length])),{
    Datasets:20,Cleaning:20,Arrays:15,Plots:15,Training:15,Optimization:10,'Syntax & help':5
  });
});
test('six starter recipes import pybms and have unique filenames',()=>{
  assert.equal(templates.length,6);
  assert.equal(new Set(templates.map(t=>t.file)).size,6);
  for(const t of templates) {assert.match(t.source,/import pybms as pb/);assert.match(t.file,/^[\w-]+\.py$/);}
});
