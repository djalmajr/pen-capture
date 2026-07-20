export async function fetchExtensionAsset(url, options = {}) {
  const includeData = options.includeData === true;
  const fetchImpl = options.fetchImpl || fetch;
  let response = await fetchImpl(url,includeData ? undefined : {method:"HEAD"});
  if (!response.ok && !includeData && [405,501].includes(response.status)) response = await fetchImpl(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const finalUrl = response.url || url;
  if (!includeData) return {finalUrl,dataUrl:null};
  const blob = await response.blob();
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset,offset+0x8000));
  return {finalUrl,dataUrl:`data:${blob.type || "application/octet-stream"};base64,${btoa(binary)}`};
}
