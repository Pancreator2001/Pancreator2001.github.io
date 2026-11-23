using System;
using System.IO;
using System.Net;
using System.Text;

// Servidor web mínimo para probar "Maia en el navegador" en el PC: sirve una carpeta en http://localhost:<puerto>/
// (localhost cuenta como sitio seguro, así que el Bluetooth web funciona en Edge/Chrome).
// Con el túnel de cloudflared (dirección https para el iPhone) va con --http-host-header localhost:<puerto>.
// POST /registro: la página manda aquí su registro (para ver desde el PC lo que pasa en el iPhone); se apunta
// en el archivo de registro, fuera de la carpeta servida.
// Uso: servidor.exe <carpeta> [puerto] [archivo de registro]
class Servidor
{
    static void Main(string[] a)
    {
        string root = Path.GetFullPath(a.Length > 0 ? a[0] : ".");
        int port = a.Length > 1 ? int.Parse(a[1]) : 8765;
        string logFile = a.Length > 2 ? a[2] : Path.Combine(Path.GetDirectoryName(root), "registro-maia-web.txt");
        var l = new HttpListener();
        l.Prefixes.Add("http://localhost:" + port + "/");
        l.Start();
        Console.WriteLine("Sirviendo " + root + " en http://localhost:" + port + "/");
        while (true)
        {
            var ctx = l.GetContext();
            try
            {
                string rel = Uri.UnescapeDataString(ctx.Request.Url.AbsolutePath).TrimStart('/');
                if (ctx.Request.HttpMethod == "POST" && rel == "registro")
                {
                    string body;
                    using (var r = new StreamReader(ctx.Request.InputStream, Encoding.UTF8)) body = r.ReadToEnd();
                    if (body.Length > 4000) body = body.Substring(0, 4000);
                    File.AppendAllText(logFile, DateTime.Now.ToString("HH:mm:ss") + "  " + body.Replace("\r", "").TrimEnd('\n') + "\n", Encoding.UTF8);
                    ctx.Response.StatusCode = 204;
                    continue;
                }
                if (rel.Length == 0) rel = "index.html";
                string path = Path.GetFullPath(Path.Combine(root, rel.Replace('/', Path.DirectorySeparatorChar)));
                if (!path.StartsWith(root, StringComparison.OrdinalIgnoreCase) || !File.Exists(path))
                {
                    ctx.Response.StatusCode = 404;
                    Console.WriteLine("404 " + rel);
                }
                else
                {
                    byte[] data = File.ReadAllBytes(path);
                    ctx.Response.ContentType = Mime(path);
                    ctx.Response.AddHeader("Cache-Control", "no-store");
                    ctx.Response.ContentLength64 = data.Length;
                    ctx.Response.OutputStream.Write(data, 0, data.Length);
                    Console.WriteLine("200 " + rel);
                }
            }
            catch (Exception e) { Console.WriteLine("ERROR " + e.Message); }
            finally { try { ctx.Response.Close(); } catch { } }
        }
    }

    static string Mime(string p)
    {
        switch (Path.GetExtension(p).ToLowerInvariant())
        {
            case ".html": return "text/html; charset=utf-8";
            case ".js": return "text/javascript; charset=utf-8";
            case ".mjs": return "text/javascript; charset=utf-8";
            case ".json": return "application/json; charset=utf-8";
            case ".css": return "text/css; charset=utf-8";
            case ".wasm": return "application/wasm";
            case ".svg": return "image/svg+xml";
            case ".png": return "image/png";
            default: return "application/octet-stream";
        }
    }
}
