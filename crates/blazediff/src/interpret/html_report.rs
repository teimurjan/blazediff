use super::types::{ChangeSeverity, InterpretResult};
use crate::{io::encode_png, qoi_io::load_qoi, types::DiffError};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use std::fs;
use std::path::Path;

pub fn image_to_data_uri<P: AsRef<Path>>(path: P) -> Result<String, DiffError> {
    let path = path.as_ref();
    let ext = path
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_ascii_lowercase())
        .ok_or_else(|| {
            DiffError::UnsupportedFormat(format!("Unsupported format: {}", path.display()))
        })?;

    match ext.as_str() {
        "png" => data_uri_from_bytes(path, "image/png"),
        "jpg" | "jpeg" => data_uri_from_bytes(path, "image/jpeg"),
        "qoi" => {
            let image = load_qoi(path)?;
            let png = encode_png(&image, 0)?;
            Ok(format!("data:image/png;base64,{}", STANDARD.encode(png)))
        }
        _ => Err(DiffError::UnsupportedFormat(format!(
            "Unsupported format: {}",
            path.display()
        ))),
    }
}

pub fn generate_html_report<P1, P2, P3>(
    result: &InterpretResult,
    img1_path: P1,
    img2_path: P2,
    output_path: P3,
) -> Result<(), DiffError>
where
    P1: AsRef<Path>,
    P2: AsRef<Path>,
    P3: AsRef<Path>,
{
    let img1_path = img1_path.as_ref();
    let img2_path = img2_path.as_ref();
    let output_path = output_path.as_ref();

    let img1_uri = image_to_data_uri(img1_path)?;
    let img2_uri = image_to_data_uri(img2_path)?;
    let result_json =
        serde_json::to_string(result).map_err(|e| DiffError::IoError(std::io::Error::other(e)))?;

    let summary = escape_html(&result.summary);
    let img1_label = escape_html(&display_name(img1_path));
    let img2_label = escape_html(&display_name(img2_path));
    let severity_label = result.severity.to_string();
    let severity_css = severity_classes(result.severity);

    let html = format!(
        "{head}{header}{images}{region_list}{script}{tail}",
        head = build_head(),
        header = build_header(
            result.diff_percentage,
            result.width,
            result.height,
            result.total_regions,
            severity_css,
            &severity_label,
            &summary
        ),
        images = build_image_section(&img1_uri, &img1_label, &img2_uri, &img2_label),
        region_list = build_region_list(),
        script = build_script(&result_json),
        tail = "</main>\n</body>\n</html>",
    );

    fs::write(output_path, html)?;
    Ok(())
}

fn build_head() -> &'static str {
    r#"<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>blazediff interpret report</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
    .region-overlay {
      position: absolute;
      display: none;
      border: 2px solid rgb(96 165 250);
      box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.5);
      pointer-events: none;
      box-sizing: border-box;
    }
    .region-card-selected {
      border-color: rgb(59 130 246);
      background-color: rgba(23, 37, 84, 0.3);
    }
  </style>
</head>
<body class="bg-black text-zinc-100">
  <main class="mx-auto flex h-screen max-w-7xl flex-col gap-3 overflow-hidden p-4">
"#
}

fn build_header(
    diff_percentage: f64,
    width: u32,
    height: u32,
    total_regions: usize,
    severity_classes: &str,
    severity_label: &str,
    summary: &str,
) -> String {
    format!(
        r#"    <header class="shrink-0 space-y-4">
      <div class="grid gap-3 text-sm text-zinc-400 md:grid-cols-3">
        <div class="rounded border border-zinc-800 bg-zinc-950/70 p-2">
          <div class="text-zinc-500">Diff</div>
          <div class="mt-1 text-base text-zinc-100">{diff_percentage:.2}%</div>
        </div>
        <div class="rounded border border-zinc-800 bg-zinc-950/70 p-2">
          <div class="text-zinc-500">Dimensions</div>
          <div class="mt-1 text-base text-zinc-100">{width}x{height}</div>
        </div>
        <div class="rounded border border-zinc-800 bg-zinc-950/70 p-2">
          <div class="text-zinc-500">Regions</div>
          <div class="mt-1 text-base text-zinc-100">{total_regions}</div>
        </div>
      </div>
      <div class="relative rounded border border-zinc-800 bg-zinc-950/70 p-2 pr-28">
        <span class="absolute right-4 top-4 rounded border px-2 py-1 text-xs uppercase tracking-[0.2em] {severity_classes}">{severity_label}</span>
        <pre class="whitespace-pre-wrap text-sm text-zinc-300">{summary}</pre>
      </div>
    </header>
"#
    )
}

fn build_image_section(
    img1_uri: &str,
    img1_label: &str,
    img2_uri: &str,
    img2_label: &str,
) -> String {
    format!(
        r#"    <section class="grid shrink gap-3 lg:grid-cols-2" style="max-height: 60vh">
      <figure class="flex min-h-0 flex-col rounded border border-zinc-800 bg-zinc-950/70 p-2">
        <figcaption class="mb-3 shrink-0 text-sm text-zinc-400">Before</figcaption>
        <div class="relative min-h-0 flex-1 overflow-hidden rounded border border-zinc-800 bg-zinc-900">
          <div class="h-full overflow-auto">
            <img id="img1" src="{img1_uri}" alt="{img1_label}" class="block h-auto w-full">
            <div id="overlay1" class="region-overlay"></div>
          </div>
        </div>
      </figure>
      <figure class="flex min-h-0 flex-col rounded border border-zinc-800 bg-zinc-950/70 p-2">
        <figcaption class="mb-3 shrink-0 text-sm text-zinc-400">After</figcaption>
        <div class="relative min-h-0 flex-1 overflow-hidden rounded border border-zinc-800 bg-zinc-900">
          <div class="h-full overflow-auto">
            <img id="img2" src="{img2_uri}" alt="{img2_label}" class="block h-auto w-full">
            <div id="overlay2" class="region-overlay"></div>
          </div>
        </div>
      </figure>
    </section>
"#
    )
}

fn build_region_list() -> &'static str {
    r#"    <section class="flex min-h-0 flex-1 flex-col gap-3">
      <div class="flex shrink-0 items-center justify-between gap-3">
        <h2 class="text-sm tracking-[0.2em] text-zinc-500">Regions</h2>
        <div class="text-xs text-zinc-600">Arrow Up/Down to navigate. Escape to clear.</div>
      </div>
      <div id="region-list" class="grid gap-2 overflow-y-auto p-[2px]"></div>
    </section>
"#
}

fn build_script(result_json: &str) -> String {
    format!(
        r#"  <script>
    const data = {result_json};
    const state = {{ selectedIndex: data.regions.length ? 0 : null }};
    const overlays = [document.getElementById("overlay1"), document.getElementById("overlay2")];
    const images = [document.getElementById("img1"), document.getElementById("img2")];
    const regionList = document.getElementById("region-list");

    function badgeClasses(changeType) {{
      switch (changeType) {{
        case "addition": return "border-emerald-800 bg-emerald-950/40 text-emerald-300";
        case "deletion": return "border-red-800 bg-red-950/40 text-red-300";
        case "shift": return "border-amber-800 bg-amber-950/40 text-amber-300";
        case "color-change": return "border-fuchsia-800 bg-fuchsia-950/40 text-fuchsia-300";
        case "content-change": return "border-cyan-800 bg-cyan-950/40 text-cyan-300";
        default: return "border-zinc-700 bg-zinc-900 text-zinc-300";
      }}
    }}

    function formatPercent(value) {{ return `${{value.toFixed(3)}}%`; }}

    function renderRegions() {{
      if (!data.regions.length) {{
        regionList.innerHTML = '<div class="rounded border border-zinc-800 bg-zinc-950/70 p-4 text-sm text-zinc-500">No actionable regions.</div>';
        return;
      }}
      regionList.innerHTML = data.regions.map((region, index) => `
        <button type="button" data-index="${{index}}"
          class="region-card flex w-full items-center gap-3 rounded border border-zinc-800 bg-zinc-950/70 px-3 py-2 text-left text-xs text-zinc-300 transition hover:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-blue-500">
          <span class="shrink-0 text-zinc-100">#${{index + 1}}</span>
          <span class="shrink-0 rounded border px-2 py-1 text-[11px] uppercase tracking-[0.2em] ${{badgeClasses(region.change_type)}}">${{region.change_type}}</span>
          <span class="truncate text-zinc-400">
            ${{region.position}} · x=${{region.bbox.x}} y=${{region.bbox.y}} · w=${{region.bbox.width}} h=${{region.bbox.height}} · pixels=${{region.pixel_count}} · change=${{formatPercent(region.percentage)}}
          </span>
        </button>
      `).join("");
      for (const button of regionList.querySelectorAll(".region-card")) {{
        button.addEventListener("click", () => selectRegion(Number(button.dataset.index)));
      }}
    }}

    function updateSelection() {{
      regionList.querySelectorAll(".region-card").forEach((card, index) => {{
        card.classList.toggle("region-card-selected", index === state.selectedIndex);
      }});
      if (state.selectedIndex === null) {{
        overlays.forEach(o => o.style.display = "none");
        return;
      }}
      const region = data.regions[state.selectedIndex];
      images.forEach((img, i) => positionOverlay(img, overlays[i], region.bbox));
      const selected = regionList.querySelector(`[data-index="${{state.selectedIndex}}"]`);
      if (selected) {{
        selected.focus({{ preventScroll: true }});
        selected.scrollIntoView({{ block: "nearest", behavior: "smooth" }});
      }}
    }}

    function positionOverlay(img, overlay, bbox) {{
      const scale = img.clientWidth / data.width;
      const imgH = img.clientHeight;
      const border = 2;
      let left = bbox.x * scale - border;
      let top = bbox.y * scale - border;
      let width = Math.max(bbox.width * scale, 2) + border * 2;
      let height = Math.max(bbox.height * scale, 2) + border * 2;
      if (left < 0) {{ width += left; left = 0; }}
      if (top < 0) {{ height += top; top = 0; }}
      if (left + width > img.clientWidth) width = img.clientWidth - left;
      if (top + height > imgH) height = imgH - top;
      overlay.style.display = "block";
      overlay.style.left = `${{left}}px`;
      overlay.style.top = `${{top}}px`;
      overlay.style.width = `${{Math.max(width, 0)}}px`;
      overlay.style.height = `${{Math.max(height, 0)}}px`;
      const scrollable = img.parentElement;
      if (top < scrollable.scrollTop) scrollable.scrollTop = top;
      else if (top + height > scrollable.scrollTop + scrollable.clientHeight)
        scrollable.scrollTop = top + height - scrollable.clientHeight;
    }}

    function selectRegion(index) {{
      if (index < 0 || index >= data.regions.length) return;
      state.selectedIndex = index;
      updateSelection();
    }}

    function moveSelection(delta) {{
      if (!data.regions.length) return;
      state.selectedIndex = state.selectedIndex === null
        ? (delta > 0 ? 0 : data.regions.length - 1)
        : (state.selectedIndex + delta + data.regions.length) % data.regions.length;
      updateSelection();
    }}

    document.addEventListener("keydown", (e) => {{
      if (e.key === "ArrowDown") {{ e.preventDefault(); moveSelection(1); }}
      else if (e.key === "ArrowUp") {{ e.preventDefault(); moveSelection(-1); }}
      else if (e.key === "Escape") {{ state.selectedIndex = null; updateSelection(); }}
    }});

    window.addEventListener("resize", updateSelection);
    images.forEach(img => img.addEventListener("load", updateSelection));
    renderRegions();
    updateSelection();
  </script>
"#
    )
}

fn data_uri_from_bytes(path: &Path, mime: &str) -> Result<String, DiffError> {
    let bytes = fs::read(path)?;
    Ok(format!("data:{mime};base64,{}", STANDARD.encode(bytes)))
}

fn display_name(path: &Path) -> String {
    path.file_name()
        .and_then(|name| name.to_str())
        .map(str::to_owned)
        .unwrap_or_else(|| path.to_string_lossy().into_owned())
}

fn severity_classes(severity: ChangeSeverity) -> &'static str {
    match severity {
        ChangeSeverity::Low => "border-emerald-800 bg-emerald-950/40 text-emerald-300",
        ChangeSeverity::Medium => "border-amber-800 bg-amber-950/40 text-amber-300",
        ChangeSeverity::High => "border-red-800 bg-red-950/40 text-red-300",
    }
}

fn escape_html(input: &str) -> String {
    input
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}
