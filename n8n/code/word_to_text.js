// Find word/document.xml inside the unzipped files and turn it into plain text.
const out = [];
const items = $input.all();

for (let i = 0; i < items.length; i++) {
  const bin = items[i].binary || {};
  const key = Object.keys(bin).find(k => (bin[k].fileName || '').endsWith('document.xml'));

  let text = '';
  if (key) {
    const xml = (await this.helpers.getBinaryDataBuffer(i, key)).toString('utf8');
    text = xml
      .replace(/<\/w:p>/g, '\n')      // end of paragraph -> new line
      .replace(/<w:br\/>/g, '\n')     // line break inside a cell -> new line
      .replace(/<w:tab\/>/g, ' ')     // tab -> space
      .replace(/<[^>]+>/g, '')        // remove every other tag
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  const original = $('Switch').itemMatching(i).json;
  out.push({ json: { fileName: original.fileName, ext: 'docx', text: text } });
}

return out;
