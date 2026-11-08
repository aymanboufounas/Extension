#!/usr/bin/env python3
"""Build a VS Code Marketplace-compatible VSIX with Python stdlib only.

No npm downloads needed. Alternative: `npx @vscode/vsce package`.
"""
import html
import json
from pathlib import Path
import zipfile
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
pkg = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))
TARGET = ROOT / 'dist' / f"{pkg['name']}-{pkg['version']}.vsix"
assets = [
    'package.json', 'README.md', 'CHANGELOG.md', 'LICENSE',
    'src/extension.js', 'src/catalog.js', 'src/templates.js',
    'assets/icon.png', 'assets/pybms.svg', 'snippets/pybms.code-snippets',
]

MANIFEST_NS = 'http://schemas.microsoft.com/developer/vsx-schema/2011'
CONTENT_NS = 'http://schemas.openxmlformats.org/package/2006/content-types'
ET.register_namespace('', MANIFEST_NS)

def element(parent, name, attrs=None, text=None):
    child = ET.SubElement(parent, f'{{{MANIFEST_NS}}}{name}', attrs or {})
    if text is not None:
        child.text = text
    return child

manifest = ET.Element(f'{{{MANIFEST_NS}}}PackageManifest', {'Version':'2.0.0'})
metadata = element(manifest, 'Metadata')
element(metadata, 'Identity', {'Language':'en-US','Id':pkg['name'],'Version':pkg['version'],'Publisher':pkg['publisher']})
element(metadata,'DisplayName',text=pkg['displayName'])
element(metadata,'Description',text=pkg['description'])
element(metadata,'Tags',text=','.join(pkg['keywords']))
element(metadata,'Categories',text=','.join(pkg['categories']))
element(metadata,'GalleryFlags',text='Public')
properties=element(metadata,'Properties')
for key,value in {
    'Microsoft.VisualStudio.Code.Engine':pkg['engines']['vscode'],
    'Microsoft.VisualStudio.Code.ExtensionDependencies':'',
    'Microsoft.VisualStudio.Code.ExtensionPack':'',
    'Microsoft.VisualStudio.Code.LocalizedLanguages':'',
    'Microsoft.VisualStudio.Code.PreRelease':'false',
    'Microsoft.VisualStudio.Code.Pricing':'Free',
    'Microsoft.VisualStudio.Services.Links.Source':pkg['repository']['url'],
    'Microsoft.VisualStudio.Services.Links.Getstarted':pkg['homepage'],
}.items():
    element(properties,'Property',{'Id':key,'Value':value})
installation=element(manifest,'Installation')
element(installation,'InstallationTarget',{'Id':'Microsoft.VisualStudio.Code'})
element(manifest,'Dependencies')
asset_element=element(manifest,'Assets')
for typ, path in [
    ('Microsoft.VisualStudio.Code.Manifest','package.json'),
    ('Microsoft.VisualStudio.Services.Content.Details','README.md'),
    ('Microsoft.VisualStudio.Services.Content.Changelog','CHANGELOG.md'),
    ('Microsoft.VisualStudio.Services.Content.License','LICENSE'),
    ('Microsoft.VisualStudio.Services.Icons.Default','assets/icon.png')
]:
    element(asset_element,'Asset',{'Type':typ,'Path':'extension/'+path,'Addressable':'true'})
manifest_xml=ET.tostring(manifest,encoding='utf-8',xml_declaration=True)
ET.register_namespace('', CONTENT_NS)
ct=ET.Element(f'{{{CONTENT_NS}}}Types')
for ext, ctype in [('json','application/json'),('js','application/javascript'),('md','text/markdown'),('png','image/png'),('svg','image/svg+xml'),('txt','text/plain'),('code-snippets','application/json')]:
    ET.SubElement(ct,f'{{{CONTENT_NS}}}Default',{'Extension':ext,'ContentType':ctype})
ET.SubElement(ct,f'{{{CONTENT_NS}}}Override',{'PartName':'/extension.vsixmanifest','ContentType':'text/xml'})
content_xml=ET.tostring(ct,encoding='utf-8',xml_declaration=True)
TARGET.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(TARGET,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as vsix:
    vsix.writestr('[Content_Types].xml',content_xml)
    vsix.writestr('extension.vsixmanifest',manifest_xml)
    for rel in assets:
        fp=ROOT/rel
        if not fp.is_file():raise SystemExit(f'Missing required extension file: {fp}')
        vsix.write(fp,'extension/'+rel)
with zipfile.ZipFile(TARGET) as z:
    bad=z.testzip()
    if bad:raise SystemExit(f'Corrupt archive entry: {bad}')
    ET.fromstring(z.read('extension.vsixmanifest'))
    assert 'extension/package.json' in z.namelist()
print(f'VSIX created: {TARGET} ({TARGET.stat().st_size:,} bytes)')
