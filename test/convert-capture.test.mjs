import { describe, expect, test } from "bun:test";
import { convertCaptureToPencil, cssBackgroundToFill, cssColorToHex } from "../src/convert-capture.mjs";

const rootStyles = { backgroundColor:"oklch(1 0 0)", borderTopColor:"oklch(0.93 0.007 106.5)", borderTopLeftRadius:"8px", borderTopRightRadius:"8px", borderBottomRightRadius:"8px", borderBottomLeftRadius:"8px", opacity:"1" };

describe("cssColorToHex", () => {
  test("converts shadcn OKLCH and transparent colors", () => {
    expect(cssColorToHex("oklch(1 0 0)")).toBe("#FFFFFF");
    expect(cssColorToHex("oklch(0.153 0.006 107.1)")).toBe("#0C0C09");
    expect(cssColorToHex("rgba(0, 0, 0, 0)")).toBeNull();
    expect(cssColorToHex("none")).toBeNull();
  });
});

describe("convertCaptureToPencil", () => {
  test("creates editable absolute layers", () => {
    const capture = { format:"pencil-capture-ir", version:1, rootPath:"0", label:"Example card", source:{}, nodes:[
      { path:"0", parentPath:null, tag:"div", name:"card", text:null, rect:{x:0,y:0,width:320,height:200}, attributes:{}, styles:rootStyles },
      { path:"0.0", parentPath:"0", tag:"div", name:"title", text:"Hello", rect:{x:16,y:16,width:288,height:24}, attributes:{}, styles:{backgroundColor:"transparent",color:"rgb(0, 0, 0)",opacity:"1",fontFamily:"Noto Sans, sans-serif",fontSize:"16px",fontWeight:"600",fontStyle:"normal",lineHeight:"24px",textAlign:"start",textTransform:"none"} },
    ] };
    const result = convertCaptureToPencil(capture);
    expect(result.root).toMatchObject({ type:"frame", name:"Captured · Example card", clip:false });
    expect(result.root.children[0]).toMatchObject({ type:"group", name:"Div · title", x:16, y:16 });
    expect(result.root.children[0].children[0]).toMatchObject({ type:"text", content:"Hello", layoutPosition:"absolute", x:0, y:0 });
  });

  test("converts SVG primitives and visible form values", () => {
    const styles = { ...rootStyles, fill:"rgb(217, 145, 23)", stroke:"none", strokeWidth:"0", color:"rgb(10, 10, 10)", fontFamily:"Noto Sans", fontSize:"14px", fontWeight:"400", fontStyle:"normal", lineHeight:"20px", textAlign:"start", textTransform:"none" };
    const capture = { format:"pencil-capture-ir", version:1, rootPath:"0", label:"Chart", source:{}, nodes:[
      { path:"0", parentPath:null, tag:"div", name:"card", text:null, rect:{x:0,y:0,width:320,height:200}, attributes:{}, styles:rootStyles },
      { path:"0.0", parentPath:"0", tag:"rect", namespace:"http://www.w3.org/2000/svg", name:"rect", text:null, rect:{x:20,y:20,width:40,height:120}, attributes:{rx:"4"}, styles },
      { path:"0.1", parentPath:"0", tag:"input", name:"input", text:null, rect:{x:80,y:20,width:200,height:32}, attributes:{value:"VOO",placeholder:"Search"}, styles:{...styles,backgroundColor:"rgb(255, 255, 255)"} },
    ] };
    const result = convertCaptureToPencil(capture);
    expect(result.stats).toMatchObject({ svgGraphics:1, controls:1 });
    expect(result.root.children).toContainEqual(expect.objectContaining({ type:"rectangle", x:20, y:20, width:40, height:120 }));
    expect(result.root.children[1].children).toContainEqual(expect.objectContaining({ type:"text", content:"VOO" }));
  });

  test("keeps nested SVG paths in the SVG viewBox instead of page coordinates", () => {
    const styles = { ...rootStyles, backgroundColor:"transparent", fill:"none", stroke:"rgb(12, 12, 9)", strokeWidth:"2px" };
    const capture = { format:"pencil-capture-ir", version:1, rootPath:"0", label:"Icon", source:{}, nodes:[
      { path:"0", parentPath:null, tag:"div", name:"root", text:null, rect:{x:0,y:0,width:200,height:100}, attributes:{}, styles:rootStyles },
      { path:"0.0", parentPath:"0", tag:"svg", namespace:"http://www.w3.org/2000/svg", name:"icon", text:null, rect:{x:140,y:20,width:16,height:16}, attributes:{viewBox:"0 0 24 24"}, styles },
      { path:"0.0.0", parentPath:"0.0", tag:"g", namespace:"http://www.w3.org/2000/svg", name:"group", text:null, rect:{x:142,y:22,width:12,height:12}, attributes:{}, styles },
      { path:"0.0.0.0", parentPath:"0.0.0", tag:"path", namespace:"http://www.w3.org/2000/svg", name:"path", text:null, rect:{x:142,y:22,width:12,height:12}, attributes:{d:"M 2 2 L 22 22"}, styles },
    ] };
    const svg = convertCaptureToPencil(capture).root.children[0];
    const group = svg.children[0];
    const path = group.children[0];
    expect(svg).toMatchObject({type:"group",x:140,y:20});
    expect(group).toMatchObject({type:"group",x:0,y:0});
    expect(path).toMatchObject({x:0,y:0,width:16,height:16,viewBox:[0,0,24,24]});
  });

  test("keeps visible SVG descendants behind zero-sized responsive wrappers", () => {
    const styles = { ...rootStyles, backgroundColor:"transparent", fill:"oklch(0.769 0.188 70.08)", stroke:"none", strokeWidth:"0" };
    const capture = { format:"pencil-capture-ir", version:1, rootPath:"0", label:"Responsive chart", source:{}, nodes:[
      { path:"0", parentPath:null, tag:"div", name:"root", text:null, rect:{x:0,y:0,width:400,height:240}, attributes:{}, styles:rootStyles },
      { path:"0.0", parentPath:"0", tag:"div", name:"responsive-container", text:null, rect:{x:0,y:0,width:0,height:0}, attributes:{}, styles },
      { path:"0.0.0", parentPath:"0.0", tag:"svg", namespace:"http://www.w3.org/2000/svg", name:"chart", text:null, rect:{x:40,y:20,width:320,height:180}, attributes:{viewBox:"0 0 320 180"}, styles },
      { path:"0.0.0.0", parentPath:"0.0.0", tag:"path", namespace:"http://www.w3.org/2000/svg", name:"bar", text:null, rect:{x:60,y:80,width:24,height:100}, attributes:{d:"M20 60 L44 60 L44 160 L20 160 Z"}, styles },
    ] };
    const result = convertCaptureToPencil(capture);
    const bridge = result.root.children[0];
    expect(result.stats.svgGraphics).toBe(1);
    expect(bridge).toMatchObject({type:"group",x:0,y:0});
    expect(bridge.children[0]).toMatchObject({type:"group",x:40,y:20});
    expect(bridge.children[0].children[0]).toMatchObject({type:"path",fill:"#FE9A00",viewBox:[0,0,320,180]});
  });

  test("preserves DOM hierarchy with coordinates relative to each parent", () => {
    const styles = { ...rootStyles, backgroundColor:"transparent", color:"rgb(0, 0, 0)", fontSize:"14px", lineHeight:"20px" };
    const capture = { format:"pencil-capture-ir", version:1, rootPath:"0", label:"Nested", source:{}, nodes:[
      { path:"0", parentPath:null, tag:"main", name:"main", text:null, rect:{x:0,y:0,width:400,height:300}, attributes:{}, styles:rootStyles },
      { path:"0.0", parentPath:"0", tag:"section", name:"Account", text:null, rect:{x:40,y:30,width:300,height:200}, attributes:{}, styles },
      { path:"0.0.0", parentPath:"0.0", tag:"p", name:"Balance", text:"Balance", textRect:{x:64,y:54,width:80,height:20}, rect:{x:60,y:50,width:260,height:32}, attributes:{}, styles },
    ] };
    const result = convertCaptureToPencil(capture);
    const section = result.root.children[0];
    const paragraph = section.children[0];
    expect(section).toMatchObject({ type:"group", x:40, y:30 });
    expect(paragraph).toMatchObject({ type:"group", x:20, y:20 });
    expect(paragraph.children[0]).toMatchObject({ type:"text", x:4, y:4, width:80, height:20 });
  });

  test("uses bounds-free groups for transparent semantic wrappers", () => {
    const styles = { ...rootStyles, backgroundColor:"transparent", color:"rgb(0, 0, 0)", fontSize:"14px", lineHeight:"20px" };
    const capture = { format:"pencil-capture-ir", version:1, rootPath:"0", label:"Overflow", source:{}, nodes:[
      { path:"0", parentPath:null, tag:"div", name:"root", text:null, rect:{x:0,y:0,width:100,height:100}, attributes:{}, styles:rootStyles },
      { path:"0.0", parentPath:"0", tag:"label", name:"Label", text:"Label", textRect:{x:10,y:7,width:40,height:19}, rect:{x:10,y:10,width:60,height:14}, attributes:{}, styles },
    ] };
    const label = convertCaptureToPencil(capture).root.children[0];
    expect(label).toMatchObject({type:"group",x:10,y:10});
    expect(label).not.toHaveProperty("width");
    expect(label.children[0]).toMatchObject({x:0,y:-3,width:40,height:19});
  });

  test("drops one-pixel accessibility controls while keeping their visible replacement", () => {
    const styles = { ...rootStyles, backgroundColor:"transparent" };
    const capture = { format:"pencil-capture-ir", version:1, rootPath:"0", label:"Hidden", source:{}, nodes:[
      { path:"0", parentPath:null, tag:"div", name:"root", text:null, rect:{x:0,y:0,width:100,height:100}, attributes:{}, styles:rootStyles },
      { path:"0.0", parentPath:"0", tag:"input", name:"native", text:null, rect:{x:-999,y:-999,width:1,height:1}, attributes:{type:"checkbox"}, styles },
      { path:"0.1", parentPath:"0", tag:"span", name:"checkbox", text:null, rect:{x:10,y:10,width:16,height:16}, attributes:{}, styles },
    ] };
    const result = convertCaptureToPencil(capture);
    expect(result.root.children).toHaveLength(1);
    expect(result.stats.skipped).toBe(1);
  });

  test("creates editable image fills for img and CSS background URLs", () => {
    const styles = { ...rootStyles, backgroundColor:"transparent", objectFit:"cover" };
    const capture = { format:"pencil-capture-ir", version:1, rootPath:"0", label:"Assets", source:{}, nodes:[
      { path:"0", parentPath:null, tag:"div", name:"root", text:null, rect:{x:0,y:0,width:300,height:200}, attributes:{}, styles:rootStyles },
      { path:"0.0", parentPath:"0", tag:"img", name:"Portrait", text:null, rect:{x:10,y:10,width:80,height:80}, attributes:{alt:"Portrait",assetUrl:"data:image/png;base64,AA=="}, styles },
      { path:"0.1", parentPath:"0", tag:"div", name:"Hero", text:null, rect:{x:100,y:10,width:180,height:80}, attributes:{backgroundAssetUrls:["data:image/jpeg;base64,AA=="]}, styles:{...styles,backgroundImage:'url("hero.jpg")',backgroundSize:"cover"} },
    ] };
    const result = convertCaptureToPencil(capture);
    expect(result.stats.images).toBe(2);
    expect(result.root.children[0]).toMatchObject({ type:"rectangle", name:"Image · Portrait", fill:{type:"image",mode:"fill"} });
    expect(result.root.children[1]).toMatchObject({ type:"frame", fill:{type:"image",mode:"fill"} });
  });

  test("expands repeating linear gradients into Pencil gradient stops", () => {
    const node = { rect:{width:100,height:100}, attributes:{}, styles:{backgroundImage:"repeating-linear-gradient(45deg, rgba(0, 0, 0, 0) 0px, rgba(0, 0, 0, 0) 10px, rgb(220, 220, 215) 10px, rgb(220, 220, 215) 11px)"} };
    const fill = cssBackgroundToFill(node);
    expect(fill).toMatchObject({ type:"gradient", gradientType:"linear", rotation:315 });
    expect(fill.colors.length).toBeGreaterThan(20);
    expect(fill.colors.some((stop) => stop.color === "#00000000")).toBe(true);
  });
});
