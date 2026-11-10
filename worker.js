export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Admin-Secret"
    };
    if (request.method === "OPTIONS") return new Response(null, {headers:cors});
    if (request.method !== "POST") return new Response("Method not allowed", {status:405,headers:cors});
    if (!env.ADMIN_SECRET || request.headers.get("X-Admin-Secret") !== env.ADMIN_SECRET)
      return Response.json({error:"Admin-Zugriff verweigert."},{status:403,headers:cors});
    if (!env.GEMINI_API_KEY) return Response.json({error:"GEMINI_API_KEY fehlt als Worker-Secret."},{status:500,headers:cors});
    try {
      const body = await request.json();
      const idea = String(body.idea || "").slice(0,5000);
      if (!idea.trim()) return Response.json({error:"Spielidee fehlt."},{status:400,headers:cors});
      const prompt = [
        "Du bist ein professioneller Browsergame-Entwickler. Erstelle ein vollständiges, originelles und hochwertiges Spiel als eine einzige selbstständige HTML-Datei.",
        "Antworte ausschließlich mit gültigem JSON: {title,desc,icon,category,html}.",
        "html muss vollständiges HTML mit eingebettetem CSS und JavaScript sein. Keine externen Bibliotheken, keine externen Bilder, keine Netzwerkzugriffe, keine Tracker.",
        "Baue ein wirklich spielbares Spiel mit Startmenü, Anleitung, klaren Zielen, Steuerung für Tastatur und Touch, Punkten, mehreren Levels oder steigender Schwierigkeit, Pause/Neustart, Game-over und gutem responsivem Design.",
        "Nutze eigene kreative Grafiken via Canvas/CSS/SVG. Keine Kopie geschützter Figuren, Marken, Level oder Assets. Schreibe sauberen robusten Code.",
        "Idee des Spiels: " + idea
      ].join("\n");
      const model = env.GEMINI_MODEL || "gemini-2.5-flash";
      const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + env.GEMINI_API_KEY, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{responseMimeType:"application/json",temperature:0.8,maxOutputTokens:16000}})
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || "KI-Anfrage fehlgeschlagen ("+response.status+")");
      let raw = data.candidates?.[0]?.content?.parts?.map(p=>p.text||"").join("") || "";
      raw = raw.replace(/^\uFEFF/,"").trim();
      const game = JSON.parse(raw);
      if (!game.html || !/<html|<!doctype/i.test(game.html)) throw new Error("Die KI hat keine gültige HTML-Spiel-Datei geliefert.");
      if (game.html.length > 240000) throw new Error("Das erzeugte Spiel ist zu groß (max. 240 KB).");
      return Response.json({game},{headers:{...cors,"Cache-Control":"no-store"}});
    } catch (error) {
      return Response.json({error:String(error.message || error)},{status:500,headers:cors});
    }
  }
};