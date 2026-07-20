function writeWithCopyEvent({html, plain}, documentRef) {
  return new Promise((resolve, reject) => {
    const onCopy = (event) => {
      event.clipboardData.setData("text/html", html);
      event.clipboardData.setData("text/plain", plain);
      event.preventDefault();
    };
    documentRef.addEventListener("copy", onCopy, {once:true});
    if (documentRef.execCommand("copy")) return resolve();
    documentRef.removeEventListener("copy", onCopy);
    reject(new Error("The extension could not write the captured design to the clipboard"));
  });
}

export async function writeClipboardPayload({html, plain}, options = {}) {
  if (typeof html !== "string" || typeof plain !== "string") throw new TypeError("Clipboard payload requires HTML and plain text");
  const clipboard = "clipboard" in options ? options.clipboard : navigator.clipboard;
  const documentRef = "documentRef" in options ? options.documentRef : document;
  const item = new ClipboardItem({
    "text/html":new Blob([html], {type:"text/html"}),
    "text/plain":new Blob([plain], {type:"text/plain"}),
  });
  try {
    await clipboard.write([item]);
  } catch (error) {
    if (!documentRef?.execCommand) throw error;
    await writeWithCopyEvent({html, plain}, documentRef);
  }
  return {ok:true, types:item.types};
}
