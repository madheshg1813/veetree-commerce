/**
 * Courier and Bill columns on the admin's order table, injected into the page.
 *
 * This deliberately avoids the widget system. Widgets in this version of the
 * dashboard are placed by a LayoutComposer that keeps a saved layout per page,
 * so a newly added widget is not guaranteed to be shown — two registered
 * correctly and neither appeared. A script in the document runs regardless of
 * React, the layout store, or any preference.
 *
 * It is still written to fail quietly. Columns are found by their heading text
 * rather than by position, rows are matched to orders by the visible order
 * number, and anything unexpected stops the script instead of throwing.
 *
 * Kept as a string because it is injected by `transformIndexHtml`, which works
 * on the built HTML and cannot import a module.
 */
export const ORDERS_TABLE_SCRIPT = `(function(){
  var MARK = "data-veetree-col";
  var data = null;
  var stopped = false;

  function text(el){ return ((el && el.textContent) || "").trim().toLowerCase(); }

  function courierFor(o){
    if(!data) return null;
    var id = o.courier || o.auto;
    if(!id) return null;
    for(var i=0;i<data.couriers.length;i++){ if(data.couriers[i].id===id) return data.couriers[i].name; }
    return id;
  }

  function esc(v){
    return String(v==null?"":v).replace(/[&<>"']/g, function(c){
      return {"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;","'":"&#39;"}[c];
    });
  }

  function label(o, courier){
    var d = o.placedAt ? new Date(o.placedAt) : new Date();
    var date = ("0"+d.getDate()).slice(-2)+"-"+("0"+(d.getMonth()+1)).slice(-2)+"-"+d.getFullYear();
    var parts = [o.address, o.city, o.postalCode].filter(Boolean).join(", ").split(",")
      .map(function(s){return s.trim();}).filter(Boolean);
    var addr = parts.length ? parts.map(function(l){return "<div>"+esc(l)+"</div>";}).join("") : "&mdash;";
    var items = (o.items||[]).reduce(function(n,i){return n+(i.qty||0);},0);
    return '<!doctype html><html><head><meta charset="utf-8"><title>Veetree &mdash; Order #'+esc(o.number)+'</title>'
      + '<style>*{box-sizing:border-box}body{font-family:"Times New Roman",Times,serif;color:#000;margin:0;padding:18px;font-size:15px;line-height:1.35}'
      + '.label{border:1.5px solid #2f6b34;padding:14px 16px;max-width:760px;margin:0 auto}'
      + '.top{display:flex;justify-content:space-between;gap:20px;align-items:flex-start}'
      + '.name{font-size:23px;font-weight:700;margin:0 0 2px}.sender div{font-size:14px}'
      + '.right{text-align:right;font-size:14px;white-space:nowrap}'
      + '.mark{font-size:12px;letter-spacing:.14em;color:#5c7a4a;margin-bottom:22px}'
      + 'hr{border:0;border-top:1.5px solid #000;margin:12px 0 8px}'
      + 'h2{font-size:17px;margin:0 0 8px}table{width:100%;border-collapse:collapse}'
      + 'td{border:1px solid #000;padding:7px 10px;vertical-align:top;font-size:16px}'
      + 'td.k{width:130px;font-weight:700}.foot{display:flex;justify-content:space-between;margin-top:10px;font-size:13px}'
      + '@media print{body{padding:0}@page{margin:10mm}}</style></head><body onload="window.print()">'
      + '<div class="label"><div class="top"><div class="sender"><p class="name">VEETREE</p>'
      + '<div>No. 30A, Gandhinagar 2nd Street,</div><div>Nandhivaram, Guduvancheri,</div>'
      + '<div>Chengalpattu (Dt),</div><div>Tamil Nadu &ndash; 603202</div><div>Ph: +91 63825 25233</div></div>'
      + '<div class="right"><div class="mark">ROOTED IN TRADITION</div>'
      + '<div><strong>Date:</strong> '+esc(date)+'</div><div><strong>Order:</strong> #'+esc(o.number)+'</div></div></div>'
      + '<hr><h2>SHIPPING TO</h2><table>'
      + '<tr><td class="k">NAME</td><td>'+esc(o.name||"\\u2014")+'</td></tr>'
      + '<tr><td class="k">ADDRESS</td><td>'+addr+'</td></tr>'
      + '<tr><td class="k">PHONE</td><td>'+esc(o.phone||"\\u2014")+'</td></tr>'
      + '<tr><td class="k">ORDER ID</td><td>#'+esc(o.number)+'</td></tr>'
      + '<tr><td class="k">COURIER</td><td>'+esc(courier||"\\u2014")
      + (o.tracking ? " &nbsp;&middot;&nbsp; Tracking: "+esc(o.tracking) : "")+'</td></tr>'
      + '</table><div class="foot"><span>'+items+' item'+(items===1?"":"s")+'</span>'
      + '<span>'+(o.total!=null?"\\u20B9"+o.total:"")+'</span><span>'+esc(o.email||"")+'</span></div></div></body></html>';
  }

  function print(o, courier){
    if(!courier){ window.alert("Choose a courier for this order first, on the Shipping page."); return; }
    var w = window.open("", "_blank", "width=820,height=900");
    if(!w) return;
    w.document.write(label(o, courier));
    w.document.close();
  }

  function decorate(){
    if(stopped || !data || !data.orders.length) return;
    var byNumber = {};
    data.orders.forEach(function(o){ if(o.number!=null) byNumber[String(o.number)] = o; });

    var tables = document.querySelectorAll("table");
    for(var t=0;t<tables.length;t++){
      var table = tables[t];
      var headRow = table.querySelector("thead tr");
      if(!headRow) continue;
      var heads = Array.prototype.slice.call(headRow.children);
      var fAt = -1, tAt = -1;
      for(var h=0;h<heads.length;h++){
        if(text(heads[h]).indexOf("fulfillment")>-1) fAt = h;
        if(text(heads[h]).indexOf("order total")>-1) tAt = h;
      }
      if(fAt===-1 || tAt===-1) continue;

      if(!headRow.querySelector("["+MARK+"]")){
        var mk = function(labelText){
          var th = document.createElement("th");
          th.setAttribute(MARK,"head");
          th.className = heads[tAt].className || "";
          th.textContent = labelText;
          return th;
        };
        heads[tAt].parentNode.insertBefore(mk("Bill"), heads[tAt].nextSibling);
        heads[fAt].parentNode.insertBefore(mk("Courier"), heads[fAt].nextSibling);
      }

      var rows = table.querySelectorAll("tbody tr");
      for(var r=0;r<rows.length;r++){
        var row = rows[r];
        if(row.querySelector("["+MARK+"]")) continue;
        var cells = Array.prototype.slice.call(row.children);
        if(cells.length <= tAt) continue;
        var num = (cells[0].textContent||"").trim().replace(/^#/,"");
        var order = byNumber[num];
        if(!order) continue;

        var courier = courierFor(order);
        var cls = cells[tAt].className || "";

        var bill = document.createElement("td");
        bill.setAttribute(MARK,"cell"); bill.className = cls;
        var btn = document.createElement("button");
        btn.type = "button"; btn.textContent = "\\uD83D\\uDDA8";
        btn.title = "Print the parcel label";
        btn.style.cssText = "cursor:pointer;background:none;border:0;font-size:16px;line-height:1;padding:0";
        (function(o,c){ btn.addEventListener("click", function(e){
          e.preventDefault(); e.stopPropagation(); print(o,c);
        }); })(order, courier);
        bill.appendChild(btn);

        var cour = document.createElement("td");
        cour.setAttribute(MARK,"cell"); cour.className = cls;
        cour.textContent = courier || "\\u2014";
        if(!courier) cour.style.opacity = "0.5";

        cells[tAt].parentNode.insertBefore(bill, cells[tAt].nextSibling);
        cells[fAt].parentNode.insertBefore(cour, cells[fAt].nextSibling);
      }
    }
  }

  function load(){
    fetch("/admin/shipping", { credentials: "include" })
      .then(function(r){ return r.ok ? r.json() : null; })
      .then(function(d){
        if(!d) return;
        data = { orders: d.orders || [], couriers: d.couriers || [] };
        decorate();
      })
      .catch(function(){});
  }

  // Re-fetch when the orders route is opened, so a courier saved on the
  // Shipping page shows here without a full reload.
  var lastPath = "";
  function tick(){
    if(location.pathname.indexOf("/orders") > -1 && location.pathname !== lastPath){
      lastPath = location.pathname;
      load();
    }
  }
  setInterval(tick, 800);
  tick();

  var observer = new MutationObserver(function(){
    try { decorate(); } catch(e){ stopped = true; observer.disconnect(); }
  });
  if(document.body) observer.observe(document.body, { childList:true, subtree:true });
  else document.addEventListener("DOMContentLoaded", function(){
    observer.observe(document.body, { childList:true, subtree:true });
  });
})();`
