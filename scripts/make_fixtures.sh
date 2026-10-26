#!/bin/sh
# Genera los videos de prueba del motor (sin internet) en <carpeta>.
#   scripts/make_fixtures.sh <carpeta> [puerto]
# Luego: python3 scripts/test_server.py <carpeta> <puerto>
set -eu
D=$1
PORT=${2:-8766}
mkdir -p "$D/hls"
cd "$D"
q="-loglevel error -y"
ffmpeg $q -f lavfi -i testsrc2=size=640x360:rate=30 -f lavfi -i sine=frequency=440 -t 4 -c:v libx264 -preset ultrafast -c:a aac -shortest clip1.mp4
ffmpeg $q -f lavfi -i testsrc=size=1280x720:rate=30 -f lavfi -i sine=frequency=660 -t 8 -c:v libx264 -b:v 3M -c:a aac -shortest clip2.mp4
ffmpeg $q -f lavfi -i testsrc2=size=1280x720:rate=30 -f lavfi -i sine=frequency=300 -t 20 -c:v libx264 -b:v 2M -c:a aac -shortest big.mp4
for n in 2 3 4 5; do cp big.mp4 "big$n.mp4"; done
# Escalera HLS: 720p y 360p con el audio aparte (como los sitios grandes).
ffmpeg $q -f lavfi -i testsrc2=size=1280x720:rate=30 -f lavfi -i sine=frequency=550 -t 6 \
  -map 0:v -map 0:v -map 1:a -c:v libx264 -preset ultrafast -c:a aac -s:v:0 1280x720 -b:v:0 2M -s:v:1 640x360 -b:v:1 600k \
  -f hls -hls_time 2 -hls_playlist_type vod -master_pl_name master.m3u8 \
  -var_stream_map "v:0,agroup:aud v:1,agroup:aud a:0,agroup:aud,language:spa,default:yes" hls/stream_%v.m3u8
# Lista (RSS).
cat > feed.xml <<XML
<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Lista de prueba</title><link>http://127.0.0.1:$PORT/</link>
<item><title>Primer clip</title><guid>c1</guid><enclosure url="http://127.0.0.1:$PORT/clip1.mp4" type="video/mp4" length="1"/></item>
<item><title>Segundo clip</title><guid>c2</guid><enclosure url="http://127.0.0.1:$PORT/clip2.mp4" type="video/mp4" length="1"/></item>
</channel></rss>
XML
# Páginas con <video>: el título sale del <title>; los subtítulos, de <track>.
page() { printf '<!doctype html><html><head><meta charset="utf-8"><title>%s</title></head><body><video controls><source src="/%s" type="video/mp4">%s</video></body></html>\n' "$2" "$3" "$4" > "$1"; }
page emoji.html "🎬 Canción de cuna — ñandú & «comillas»" clip1.mp4 ""
long=$(python3 -c "print(('Título larguísimo con acentos áéíóú ' * 12).strip())")
page long.html "$long" clip1.mp4 ""
page subs.html "Con subtítulos" clip1.mp4 '<track kind="subtitles" srclang="es" label="Español" src="/sub.es.vtt"><track kind="subtitles" srclang="en" label="English" src="/sub.en.vtt">'
printf 'WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nHola, esto es una prueba.\n\n00:00:02.000 --> 00:00:04.000\nSegunda línea, con acentos: ñ á é.\n' > sub.es.vtt
printf 'WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nHello, this is a test.\n' > sub.en.vtt
echo "fixtures en $D"
