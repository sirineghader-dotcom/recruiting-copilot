// The form gives ONE item containing several files.
// We turn it into ONE item PER file.
const out = [];

for (const item of $input.all()) {
  for (const key of Object.keys(item.binary || {})) {
    const file = item.binary[key];
    const ext = file.fileName.split('.').pop().toLowerCase();

    out.push({
      json: { fileName: file.fileName, ext: ext },
      binary: { file: file }
    });
  }
}

return out;
