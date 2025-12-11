import { Readability } from "./lib/readability.js";
import { DOMParser } from "https://deno.land/x/deno_dom@v0.1.45/deno-dom-wasm.ts";

export default async (req) => {
  let status = 200;
  let contents = "Append a URL in the address bar to begin.";

  const requestUrl = new URL(req.url);
  const url = requestUrl.pathname.slice(1);

  if (url) {
    const pageUrl = new URL(url);
    const fallbackURI = pageUrl.origin + pageUrl.pathname;

    try {
      const { data: pageContent, error } = await fetchDocument(url);
      if (error) throw error;

      // get baseURI and documentURI from fetchDocument and attach to doc?
      const doc = new DOMParser().parseFromString(pageContent, "text/html");
      if (doc === null) throw Error("Unable to parse page content");

      const reader = new Readability(doc, { fallbackURI });
      const parsed = reader.parse();
      const title = parsed!.title as string;
      const content = parsed!.content as string;

      contents = renderHtml(url, title, content);
    } catch (e) {
      console.error(e);
      status = 500;
      contents = "Unable to fetch page";
    }
  }

  return new Response(contents, {
    status,
    headers: { "content-type": "text/html" },
  });
};

async function fetchDocument(url: string) {
  let data = "", error = undefined;

  // add protocol if it doesn't exist
  if (!/^https?:\/\//.test(url)) {
    url = "https://" + url;
  }

  try {
    const res = await fetch(url);
    if (!res.ok) throw Error(res.statusText);
    data = await res.text();
  } catch (e) {
    error = e;
  }

  return { data, error };
}

function renderHtml(url: string, title: string, content: string, timestamp?: number) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="X-UA-Compatible" content="ie=edge">
        <title>${title}</title>
        <style>
          body{padding:0 10px;margin:40px auto;max-width:650px;line-height:1.6;font-size:18px;color:#444;}
          h1,h2,h3{line-height:1.2}
          img{width:100%;height:auto;}
          figure,table,code,pre{width:100%;overflow-x:auto;padding:0;margin:0;}
        </style>
    </head>
    <body>
      <header>
        <small><a href="${url}">Link to original content</a></small>
        <h1>${title}</h1>
      </header>
      ${content}
    </body>
    <script>
    (function() {/* 1. Save the contents of this file as the URL of a new bookmark in your      browser.   2. Visit a website and activate the bookmark. */var libScript = document.createElement('script');libScript.src = 'https://unpkg.com/tex-linebreak';document.body.appendChild(libScript);var dictScript = document.createElement('script');dictScript.src = 'https://unpkg.com/tex-linebreak/dist/hyphens_en-us.js';document.body.appendChild(dictScript);var libLoaded = new Promise(resolve => libScript.onload=resolve);var dictLoaded = new Promise(resolve => dictScript.onload=resolve);Promise.all([libLoaded, dictLoaded]).then(() => {  var lib = window.texLineBreak_lib;  var h = lib.createHyphenator(window['texLineBreak_hyphens_en-us']);  var paras = [...document.querySelectorAll('p')];  lib.justifyContent(paras, h);}).catch(err => console.error(err));})()
    </script>
    </html>
  `;
}

export const config = { path: "/reader/*" };
