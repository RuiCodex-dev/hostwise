// Renders the plan sections the agent streams back. Guest names are substituted here,
// in the browser, from tokens like {{g0}}; the server never sees them.
import { h, s, icon, img } from "./dom.js";

export const LEFT_OUT = 0.35;
const KIND_LABEL = { "common-ground": "Common ground", "friendly-debate": "Friendly debate", "table-question": "For the whole table" };

export function makeRenderer(getNames) {
  const name = (i) => getNames()[i] || `Guest ${i + 1}`;
  const sub = (text) => String(text ?? "").replace(/\{\{g(\d+)\}\}/g, (_, i) => name(Number(i)));
  const pct = (x) => `${Math.round((x ?? 0) * 100)}`;

  function fits(values, caption) {
    const box = h("div", { class: "fits", role: "list", "aria-label": caption || "Fit for each guest" });
    values.forEach((v, i) => {
      box.append(
        h("div", { class: `fit${v < LEFT_OUT ? " low" : ""}`, role: "listitem" },
          h("span", { class: "who" }, name(i)),
          h("span", { class: "bar", "aria-hidden": "true" }, h("i", { style: `width:${Math.max(3, Math.round(v * 100))}%` })),
          h("span", { class: "v" }, pct(v)),
        ),
      );
    });
    return box;
  }

  function via(card) {
    if (!card.via?.length) return null;
    return h("p", { class: "evidence" }, "Pulled in by ",
      ...card.via.flatMap((v, k) => [k ? ", " : "", h("strong", {}, v.favourite), ` (${name(v.guest)})`]), ".");
  }

  function baselineCallout(b, what) {
    if (!b || !b.improved || !b.pooledName) return null;
    return h("p", { class: "callout" }, icon("scale"),
      h("span", {}, `A single pooled recommendation would have chosen `, h("strong", {}, b.pooledName),
        `, whose weakest fit is ${pct(b.pooledMinFit)}. Scoring per guest lifts the ${what}'s weakest fit to ${pct(b.chosenMinFit)}.`));
  }

  function replanCallout(r) {
    if (!r) return null;
    const who = r.leftOut.map(name).join(" and ");
    const text = r.after.name === r.before.name
      ? `The agent saw ${who} would be left out, fetched ${r.added} options from ${r.leftOut.length > 1 ? "their" : "their"} side of the taste graph, re-scored them for everyone, and kept ${r.after.name} as the fairest choice.`
      : `${r.before.name} would have left ${who} at ${pct(r.before.minFit)}. The agent re-planned with ${r.added} picks from ${who}'s side of the graph and found ${r.after.name}: weakest fit ${pct(r.after.minFit)}.`;
    return h("p", { class: "callout replan" }, icon("git-branch"), h("span", {}, text));
  }

  return {
    sub,
    thought(ev) {
      return h("li", { class: `t-thought${ev.phase === "replan" ? " replan" : ""}` }, sub(ev.text));
    },
    tool(ev) {
      const li = h("li", { class: "t-tool", dataset: { status: ev.status, id: ev.id } });
      this.updateTool(li, ev);
      return li;
    },
    updateTool(li, ev) {
      li.dataset.status = ev.status;
      li.replaceChildren();
      const summary = h("summary", {},
        h("span", { class: "dot", "aria-hidden": "true" }),
        h("span", { class: "tname" }, ev.tool),
        h("span", { class: "tlabel" }, sub(ev.label)),
        ev.provenance?.cached ? h("span", { class: "tag" }, "cached") : null,
        ev.status === "error" ? h("span", { class: "tag" }, ev.error?.code || "error") : null,
      );
      const det = h("details", {}, summary);
      if (ev.provenance) {
        const p = ev.provenance;
        det.append(h("pre", {}, `${p.method} ${p.path}\n${Object.entries(p.params).map(([k, v]) => `  ${k}=${v}`).join("\n")}\n-> ${p.count} result(s), ${p.cached ? "served from cache" : `${p.ms} ms`}\n(credential sent server-side as a header; never shown)`));
      }
      li.append(det);
    },

    seating(data) {
      const n = data.order.length;
      const W = 520, C = 260, RT = 112, RS = 152, RN = 184;
      const svg = s("svg", { class: "round-table", viewBox: `0 40 ${W} ${W - 80}`, role: "img", "aria-label": `Seating: ${data.order.map(name).join(", ")}` });
      svg.append(s("circle", { class: "tbl", cx: C, cy: C, r: RT }));
      const pos = (k, r) => {
        const a = -Math.PI / 2 + (2 * Math.PI * k) / n;
        return [C + r * Math.cos(a), C + r * Math.sin(a)];
      };
      for (let k = 0; k < n; k++) {
        const [x1, y1] = pos(k, RS - 18);
        const [x2, y2] = pos((k + 1) % n, RS - 18);
        if (n > 2 || k === 0) svg.append(s("path", { class: "edge", d: `M${x1},${y1} Q${C},${C} ${x2},${y2}` }));
      }
      data.order.forEach((g, k) => {
        const [x, y] = pos(k, RS);
        svg.append(s("circle", { class: "seat", cx: x, cy: y, r: 14 }));
        const [tx, ty] = pos(k, RN);
        const anchor = Math.abs(tx - C) < 20 ? "middle" : tx > C ? "start" : "end";
        svg.append(s("text", { class: "seat-name", x: tx, y: ty + 6, "text-anchor": anchor }, name(g).slice(0, 14)));
      });
      const list = h("ul", { class: "pairs" });
      for (const p of data.pairs) {
        list.append(h("li", {},
          h("div", { class: "who" }, `${name(p.a)} & ${name(p.b)}`),
          h("div", { class: "why" }, p.bridge ? `Shared thread: ${p.bridge}` : "Different worlds: a good debate pairing",
            p.shared?.length > 1 ? ` · also ${p.shared.filter((t) => t !== p.bridge).slice(0, 2).join(", ")}` : ""),
        ));
      }
      return h("div", {},
        h("h3", { class: "sec-title" }, "Who sits next to whom"),
        h("p", { class: "sec-sub" }, "Qloo compared every pair of guests' taste audiences. The agent arranged the table so the weakest neighbour pair still has real common ground."),
        h("div", { class: "table-wrap" }, svg, list));
    },

    menu(m) {
      const courses = h("ul", { class: "courses" });
      for (const c of m.courses) {
        courses.append(h("li", {}, h("span", { class: "c" }, c.course), h("span", { class: "d" }, c.dish,
          !c.inclusive && c.alternative ? h("span", { class: "alt" }, `Plus a plate of ${c.alternative.toLowerCase()} for anyone it doesn't suit`) : null)));
      }
      const drinks = h("div", { class: "drinks" },
        m.allZeroProof
          ? [h("span", {}, icon("wine"), `For everyone: ${m.zeroProof}`), h("span", { class: "muted" }, `Wine for those who'd like it: ${m.drink}`)]
          : [h("span", {}, icon("wine"), m.drink), h("span", {}, icon("sparkles"), `Zero-proof: ${m.zeroProof}`)]);
      const right = h("div", {},
        h("h3", { class: "sec-title" }, m.label),
        h("p", { class: "sec-sub" }, m.mood),
        courses,
        m.accents?.length ? h("p", { class: "callout replan" }, icon("git-branch"), h("span", {}, ...m.accents.flatMap((a, k) => [k ? " " : "", `${a.guests.map(name).join(" and ")} ${a.guests.length > 1 ? "lean" : "leans"} towards ${a.label}, so the agent added a bridge starter: `, h("strong", {}, a.dish), "."]))) : null,
        m.unserved?.length ? h("p", { class: "callout" }, icon("info"), h("span", {}, `Qloo shows no clear cuisine lean for ${m.unserved.map(name).join(" and ")}. Worth asking what they'd love on the table.`)) : null,
        drinks,
        m.dietsHonoured?.length ? h("p", { class: "evidence" }, "Adapted for: ", h("strong", {}, m.dietsHonoured.join(", ")), " (handled by Hostwise, never sent to Qloo).") : null,
        m.fits ? fits(m.fits, "How this cuisine fits each guest") : null,
        m.evidence?.length
          ? h("p", { class: "evidence" }, "Qloo place tags behind it: ", h("strong", {}, (m.evidence[0].tags || []).join(", ")),
            m.evidence.length > 1 ? `. Also considered: ${m.evidence.slice(1).map((e) => e.label).join(", ")}.` : ".")
          : null,
      );
      return h("div", { class: "sec-grid" }, h("div", { class: "plate" }, h("img", { src: "/img/menu-640.webp", srcset: "/img/menu-640.webp 640w, /img/menu-1200.webp 1200w", sizes: "(max-width: 760px) 100vw, 520px", alt: "Ingredients laid out on linen: heirloom tomatoes, figs, lemons, basil and cheese.", loading: "lazy" })), right);
    },

    soundtrack(st) {
      const fan = (a) => {
        const best = a.fits.indexOf(Math.max(...a.fits));
        return `closest to ${name(best)}'s taste`;
      };
      const line = (a, mood) => mood === "arrival" ? `nobody below ${pct(Math.min(...a.fits))}` : fan(a);
      const col = (title, subtitle, list, mood) => h("div", {}, h("h4", {}, title, h("small", {}, subtitle)),
        ...list.map((a) => h("div", { class: "artist" }, img(a.image, ""), h("div", {}, h("div", { class: "n" }, a.name), h("div", { class: "s" }, line(a, mood) + (a.source !== "pooled" ? " · found on re-plan" : ""))))));
      const top = st.arrival[0];
      return h("div", {},
        h("h3", { class: "sec-title" }, "A soundtrack in three moods"),
        h("p", { class: "sec-sub" }, "Artists, not a fixed playlist: start with the room's safest common ground, end with the picks that split opinion most."),
        h("div", { class: "tracks" },
          col("Arrival", "everyone's comfortable", st.arrival, "arrival"),
          col("Dinner", "warming up: one for each corner", st.dinner, "dinner"),
          col("Late", "a little more adventurous", st.late, "late")),
        top ? h("div", {}, h("p", { class: "evidence" }, h("strong", {}, top.name), " fits each guest like this:"), fits(top.fits), via(top)) : null,
        replanCallout(st.replanned), baselineCallout(st.baseline, "opener"));
    },

    film(f) {
      const p = f.pick;
      const meta = [p.year, p.duration ? `${p.duration} min` : null, p.rating].filter(Boolean).join(" · ");
      return h("div", { class: "film" },
        h("div", { class: "poster" }, p.image ? img(p.image, `Poster artwork for ${p.name}`) : h("img", { src: "/img/film-640.webp", alt: "A projector beam on a blank living-room wall.", loading: "lazy" })),
        h("div", {},
          h("h3", { class: "sec-title" }, p.name),
          meta ? h("p", { class: "film-meta" }, meta) : null,
          p.blurb ? h("p", { class: "film-blurb" }, p.blurb) : null,
          fits(p.fits, "How the film fits each guest"),
          via(p),
          replanCallout(f.replanned),
          baselineCallout(f.baseline, "film"),
          f.alternates?.length ? h("p", { class: "alts" }, "If it's been seen: ", h("strong", {}, f.alternates.map((a) => a.name).join(" or ")), ".") : null,
          f.rejected?.length ? h("p", { class: "rejected" }, `Ruled out for length: ${f.rejected.slice(0, 4).map((r) => r.name).join(", ")}.`) : null,
        ));
    },

    deck(d) {
      const deck = h("div", { class: "deck" });
      d.cards.forEach((c, i) => {
        const tilt = ((i * 37) % 5 - 2) * 0.5;
        let ev = null;
        if (c.kind === "common-ground" && c.evidence?.tag) ev = `Qloo shared tag: ${c.evidence.tag}`;
        else if (c.kind === "friendly-debate") ev = "Qloo audience comparison: distinct tags";
        else if (c.evidence?.entity) ev = `From the plan: ${c.evidence.entity}`;
        deck.append(h("div", { class: "card", style: `--tilt:${tilt}deg` }, h("span", { class: "k" }, KIND_LABEL[c.kind] || "Card"), sub(c.text), ev ? h("span", { class: "ev" }, ev) : null));
      });
      return h("div", {},
        h("h3", { class: "sec-title" }, "Cards for the table"),
        h("p", { class: "sec-sub" }, "Written from what neighbouring guests share, and from where they differ. Print them, cut them, leave them by the plates."),
        deck);
    },
  };
}
