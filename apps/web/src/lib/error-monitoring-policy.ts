export function redactApplicationErrorText(value:string){return value
  .replace(/postgres(?:ql)?:\/\/[^\s]+/gi,"[database-url]")
  .replace(/bearer\s+[a-z0-9._~+/=-]+/gi,"Bearer [redacted]")
  .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,"[email]")
  .replace(/\+?\d[\d\s().-]{8,}\d/g,"[phone]")
  .replace(/\b\d{6}\b/g,"[code]")
  .replace(/([?&](?:token|code|key|secret|signature)=)[^&\s]+/gi,"$1[redacted]");}
