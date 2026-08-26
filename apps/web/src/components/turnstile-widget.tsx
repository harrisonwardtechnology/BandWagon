"use client";

import Script from "next/script";
import { useEffect, useRef } from "react";

type TurnstileApi={render:(container:HTMLElement,options:Record<string,unknown>)=>string;remove:(widgetId:string)=>void;};
declare global{interface Window{turnstile?:TurnstileApi;}}

export default function TurnstileWidget({action,onToken,resetKey=0}:{action:string;onToken:(token:string)=>void;resetKey?:number}){
  const siteKey=process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY||"",host=useRef<HTMLDivElement>(null),widgetId=useRef<string|null>(null);
  function render(){if(!siteKey||!window.turnstile||!host.current||widgetId.current)return;widgetId.current=window.turnstile.render(host.current,{sitekey:siteKey,action,callback:(value:string)=>onToken(value),"expired-callback":()=>onToken(""),"error-callback":()=>onToken("")});}
  useEffect(()=>{if(widgetId.current&&window.turnstile){window.turnstile.remove(widgetId.current);widgetId.current=null;}onToken("");render();return()=>{if(widgetId.current&&window.turnstile){window.turnstile.remove(widgetId.current);widgetId.current=null;}};},[resetKey]);
  if(!siteKey)return <p role="status" style={{color:"#9a3412"}}><strong>The security check is not configured.</strong></p>;
  return <><Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" onLoad={render}/><div ref={host}/></>;
}
