// Compression only accepts files named .zip, and a .docx IS a zip inside.
// So we keep the same file but relabel it as zip.
return $input.all().map(item => {
  const file = {
    ...item.binary.file,
    fileName: item.json.fileName + '.zip',
    fileExtension: 'zip',
    mimeType: 'application/zip'
  };
  return { json: item.json, binary: { file: file } };
});
