import { findCanvas } from './data.js'

let _currentCanvasId = null
let _canvasData = null
let _animationId = null
let _history = null
let _renderedCanvasId = null
let _ctx = null
let _arrowCtx = null
let _parentTree = null
let _renderDirty = false
let _lastCanvasW = 0, _lastCanvasH = 0
let _cachedGridRgb = null
let _cachedThemeBg = null
let _cachedAccent = null
let _cachedPanelBg = null

/* ─── History Manager ─── */
function createHistoryManager() {
  let undoStack = [], redoStack = []
  const MAX_SIZE = 200
  let isUndoRedoing = false
  return {
    push(cmd) {
      if (isUndoRedoing) return
      undoStack.push(cmd)
      if (undoStack.length > MAX_SIZE) undoStack.shift()
      redoStack = []
      markDirty()
    },
    undo() {
      if (undoStack.length === 0) return
      isUndoRedoing = true
      const cmd = undoStack.pop()
      cmd.undo()
      redoStack.push(cmd)
      isUndoRedoing = false
      markDirty(); updateSidePanel()
    },
    redo() {
      if (redoStack.length === 0) return
      isUndoRedoing = true
      const cmd = redoStack.pop()
      cmd.redo()
      undoStack.push(cmd)
      isUndoRedoing = false
      markDirty(); updateSidePanel()
    },
    clear() { undoStack = []; redoStack = [] }
  }
}

/* ─── Utility ─── */
function markDirty() { if (window.__autoSave) window.__autoSave() }
function escAttr(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)) }

function screenToWorld(sx, sy) {
  return { x: (sx - _ui.offsetX) / _ui.scale, y: (sy - _ui.offsetY) / _ui.scale }
}
function worldToScreen(wx, wy) {
  return { x: wx * _ui.scale + _ui.offsetX, y: wy * _ui.scale + _ui.offsetY }
}

function getThemeBg() { if (!_cachedThemeBg) _cachedThemeBg = getComputedStyle(document.documentElement).getPropertyValue('--bg-body').trim() || '#111118'; return _cachedThemeBg }
function getAccentColor() { if (!_cachedAccent) _cachedAccent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#4f46e5'; return _cachedAccent }
function getTextPrimary() { return getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim() || '#e0e0e8' }
function getTextDim() { return getComputedStyle(document.documentElement).getPropertyValue('--text-dim').trim() || '#666' }
function getPanelBg() { if (!_cachedPanelBg) _cachedPanelBg = getComputedStyle(document.documentElement).getPropertyValue('--bg-panel-alt').trim() || '#1e1e2e'; return _cachedPanelBg }
function hexToRgb(hex) {
  hex = hex.replace('#', '')
  if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2]
  const m = hex.match(/\w\w/g)
  if (!m) return [25, 25, 40]
  return m.map(x => parseInt(x, 16))
}

/* ─── Color Picker ─── */
const BUILT_IN_COLORS = ['#ffffff','#000000','#888888','#e74c3c','#f39c12','#f1c40f','#2ecc71','#3498db','#9b59b6','#2c3e50']
const WHEEL_SIZE = 140
let _popoverEl = null, _activeSwatchEl = null, _activeSwatchCB = null, _currentHSV = { h: 0, s: 0, v: 1 }

function hsvToRgb(h, s, v) {
  let r, g, b
  const i = Math.floor(h * 6), f = h * 6 - i
  const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s)
  switch (i % 6) { case 0: r=v;g=t;b=p;break; case 1: r=q;g=v;b=p;break; case 2: r=p;g=v;b=t;break; case 3: r=p;g=q;b=v;break; case 4: r=t;g=p;b=v;break; case 5: r=v;g=p;b=q;break }
  return [Math.round(r*255), Math.round(g*255), Math.round(b*255)]
}
function hsvToHex(h, s, v) {
  const [r,g,b] = hsvToRgb(h,s,v)
  return '#'+[r,g,b].map(c=>c.toString(16).padStart(2,'0')).join('')
}
function hexToHsv(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!m) return {h:0,s:0,v:1}
  let r=parseInt(m[1],16)/255, g=parseInt(m[2],16)/255, b=parseInt(m[3],16)/255
  const max=Math.max(r,g,b), min=Math.min(r,g,b), d=max-min
  let h=0, s=max===0?0:d/max, v=max
  if (max!==min) {
    if (max===r) h=((g-b)/d+(g<b?6:0))/6
    else if (max===g) h=((b-r)/d+2)/6
    else h=((r-g)/d+4)/6
  }
  return {h,s,v}
}
function drawColorWheel(canvas, hsv) {
  const cx=canvas.width/2, cy=canvas.height/2, radius=Math.min(cx,cy)-2
  const radius2=radius*radius, edgeRadius2=(radius+1)*(radius+1)
  const ctx=canvas.getContext('2d'), imageData=ctx.createImageData(canvas.width,canvas.height), data=imageData.data
  for (let y=0; y<canvas.height; y++) {
    for (let x=0; x<canvas.width; x++) {
      const dx=x-cx, dy=y-cy, dist2=dx*dx+dy*dy
      if (dist2>edgeRadius2) continue
      const dist=Math.sqrt(dist2)
      let alpha=255
      if (dist>radius) alpha=Math.round((1-(dist-radius))*255)
      const hue=((Math.atan2(dy,dx)/Math.PI/2)+1)%1
      const sat=Math.min(dist/radius,1)
      const [r,g,b]=hsvToRgb(hue,sat,1)
      const idx=(y*canvas.width+x)*4
      data[idx]=r; data[idx+1]=g; data[idx+2]=b; data[idx+3]=alpha
    }
  }
  ctx.putImageData(imageData,0,0)
  ctx.beginPath(); ctx.arc(cx,cy,radius+0.5,0,Math.PI*2); ctx.strokeStyle='rgba(0,0,0,0.25)'; ctx.lineWidth=1; ctx.stroke()
  const angle=hsv.h*Math.PI*2, pickR=hsv.s*radius
  const pickX=cx+pickR*Math.cos(angle), pickY=cy+pickR*Math.sin(angle)
  ctx.beginPath(); ctx.arc(pickX,pickY,4,0,Math.PI*2); ctx.strokeStyle=hsv.v>0.5?'#000':'#fff'; ctx.lineWidth=2; ctx.stroke()
  ctx.beginPath(); ctx.arc(pickX,pickY,2.5,0,Math.PI*2); ctx.strokeStyle=hsv.v>0.5?'rgba(255,255,255,0.7)':'rgba(0,0,0,0.5)'; ctx.lineWidth=1; ctx.stroke()
}
function colorFromWheelPoint(canvas, clientX, clientY) {
  const rect=canvas.getBoundingClientRect(), x=clientX-rect.left, y=clientY-rect.top
  const cx=canvas.width/2, cy=canvas.height/2, dx=x-cx, dy=y-cy, dist=Math.sqrt(dx*dx+dy*dy)
  const radius=Math.min(cx,cy)-2
  if (dist>radius) return null; if (dist<0.5) return {h:0,s:0}
  const hue=((Math.atan2(dy,dx)/Math.PI/2)+1)%1, sat=Math.min(dist/radius,1)
  return {h:hue,s:sat}
}
function createColorPopover() { if (_popoverEl) return; _popoverEl=document.createElement('div'); _popoverEl.className='color-popover'; _popoverEl.style.display='none'; document.body.appendChild(_popoverEl); _popoverEl.addEventListener('pointerdown',e=>e.stopPropagation()) }
function renderColorPopover() {
  if (!_popoverEl||!_activeSwatchEl) return
  const currentColor=_activeSwatchEl.dataset.color||'#000000', initHsv=hexToHsv(currentColor)
  let html='<div class="color-popover-grid">'
  for (const c of BUILT_IN_COLORS) html+='<button type="button" class="color-popover-swatch'+(c===currentColor?' active':'')+'" style="background:'+c+'" data-color="'+c+'" title="'+c+'"></button>'
  html+='</div><div class="color-popover-divider"></div>'
  html+='<div class="color-popover-wheel-wrap"><canvas class="color-popover-wheel" id="colorPopoverWheel" width="'+WHEEL_SIZE+'" height="'+WHEEL_SIZE+'"></canvas></div>'
  html+='<div class="color-popover-sliders">'
  html+='<div class="color-popover-slider-row"><span class="color-popover-slider-label">H</span><div class="color-popover-slider" id="cpSliderH"><div class="color-popover-slider-track" id="cpSliderHTrack"></div><div class="color-popover-slider-thumb" id="cpSliderHThumb"></div></div><span class="color-popover-slider-value" id="cpSliderHVal">'+Math.round(initHsv.h*360)+'\u00B0</span></div>'
  html+='<div class="color-popover-slider-row"><span class="color-popover-slider-label">S</span><div class="color-popover-slider" id="cpSliderS"><div class="color-popover-slider-track" id="cpSliderSTrack"></div><div class="color-popover-slider-thumb" id="cpSliderSThumb"></div></div><span class="color-popover-slider-value" id="cpSliderSVal">'+Math.round(initHsv.s*100)+'%</span></div>'
  html+='<div class="color-popover-slider-row"><span class="color-popover-slider-label">V</span><div class="color-popover-slider" id="cpSliderV"><div class="color-popover-slider-track" id="cpSliderVTrack"></div><div class="color-popover-slider-thumb" id="cpSliderVThumb"></div></div><span class="color-popover-slider-value" id="cpSliderVVal">'+Math.round(initHsv.v*100)+'%</span></div>'
  html+='</div><div class="color-popover-preview" id="colorPopoverPreview">'+currentColor+'</div>'
  _popoverEl.innerHTML=html
  _popoverEl.querySelectorAll('.color-popover-swatch').forEach(btn=>{ btn.addEventListener('pointerdown',e=>{ e.stopPropagation(); applyHex(btn.dataset.color); hideColorPopover() }) })
  _currentHSV={...initHsv}
  const wheel=document.getElementById('colorPopoverWheel')
  if (wheel) { drawColorWheel(wheel,_currentHSV); initWheel(wheel) }
  initColorSlider('H'); initColorSlider('S'); initColorSlider('V'); updateAllSliders()
}
function initWheel(canvas) {
  let dragging=false
  function pick(e) { const r=colorFromWheelPoint(canvas,e.clientX,e.clientY); if(!r)return; _currentHSV.h=r.h; _currentHSV.s=r.s; applyCurrentColor() }
  canvas.addEventListener('pointerdown',e=>{ if(e.button!==0)return; dragging=true; canvas.setPointerCapture(e.pointerId); pick(e) })
  canvas.addEventListener('pointermove',e=>{ if(!dragging)return; pick(e) })
  canvas.addEventListener('pointerup',e=>{ if(!dragging)return; dragging=false; try{canvas.releasePointerCapture(e.pointerId)}catch{} })
}
function initColorSlider(comp) {
  const track=document.getElementById('cpSlider'+comp+'Track'), thumb=document.getElementById('cpSlider'+comp+'Thumb')
  if(!track||!thumb) return
  let dragging=false
  function frac(e) { const r=track.getBoundingClientRect(); return Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)) }
  function apply(f) { _currentHSV[comp.toLowerCase()]=f; applyCurrentColor() }
  function onDown(e) { if(e.button!==0)return; dragging=true; track.setPointerCapture(e.pointerId); apply(frac(e)) }
  function onMove(e) { if(!dragging)return; apply(frac(e)) }
  function onUp(e) { if(!dragging)return; dragging=false; try{track.releasePointerCapture(e.pointerId)}catch{} }
  track.addEventListener('pointerdown',onDown); track.addEventListener('pointermove',onMove); track.addEventListener('pointerup',onUp)
  thumb.addEventListener('pointerdown',e=>{e.stopPropagation();onDown(e)})
}
function hueGradient() { const s=[]; for(let i=0;i<=6;i++){ s.push(hsvToHex(i/6,1,1)+' '+(i/6*100)+'%') }; return 'linear-gradient(to right,'+s.join(',')+')' }
function satGradient() { return 'linear-gradient(to right,'+hsvToHex(_currentHSV.h,0,1)+','+hsvToHex(_currentHSV.h,1,1)+')' }
function valGradient() { return 'linear-gradient(to right,#000,'+hsvToHex(_currentHSV.h,_currentHSV.s,1)+')' }
function updateAllSliders() {
  const u=(c,f,t)=>{ const tr=document.getElementById('cpSlider'+c+'Track'),th=document.getElementById('cpSlider'+c+'Thumb'),v=document.getElementById('cpSlider'+c+'Val'); if(tr)tr.style.background=c==='H'?hueGradient():c==='S'?satGradient():valGradient(); if(th)th.style.left=(f*100)+'%'; if(v)v.textContent=t }
  u('H',_currentHSV.h,Math.round(_currentHSV.h*360)+'\u00B0'); u('S',_currentHSV.s,Math.round(_currentHSV.s*100)+'%'); u('V',_currentHSV.v,Math.round(_currentHSV.v*100)+'%')
}
function syncUI(hex) {
  if (_activeSwatchEl) { _activeSwatchEl.style.background=hex; _activeSwatchEl.dataset.color=hex }
  const preview=document.getElementById('colorPopoverPreview'); if (preview) preview.textContent=hex
  const wheel=document.getElementById('colorPopoverWheel'); if (wheel) drawColorWheel(wheel,_currentHSV)
  updateAllSliders()
  if (_activeSwatchCB&&_activeSwatchCB.onSelect) _activeSwatchCB.onSelect(hex)
}
function applyCurrentColor() { syncUI(hsvToHex(_currentHSV.h,_currentHSV.s,_currentHSV.v)) }
function applyHex(hex) { _currentHSV=hexToHsv(hex); syncUI(hex) }
function positionColorPopover() {
  if (!_popoverEl||!_activeSwatchEl) return
  const sr=_activeSwatchEl.getBoundingClientRect(), pr=_popoverEl.getBoundingClientRect()
  let left=sr.left, top=sr.bottom+4
  if (left+pr.width>window.innerWidth-8) left=window.innerWidth-pr.width-8
  if (top+pr.height>window.innerHeight-8) top=sr.top-pr.height-4
  if (left<8) left=8
  _popoverEl.style.left=left+'px'; _popoverEl.style.top=top+'px'
}
function showColorPopover(el, cb) { createColorPopover(); _activeSwatchEl=el; _activeSwatchCB=cb; renderColorPopover(); _popoverEl.style.display=''; positionColorPopover() }
function hideColorPopover() { if (!_popoverEl) return; _popoverEl.style.display='none'; _activeSwatchEl=null; _activeSwatchCB=null }

document.addEventListener('pointerdown', e => {
  if (_popoverEl && _popoverEl.style.display !== 'none' && !_popoverEl.contains(e.target)) hideColorPopover()
})
window.addEventListener('resize', () => {
  if (_popoverEl && _popoverEl.style.display !== 'none') positionColorPopover()
})

function colorSwatchHTML(id, color) {
  return '<button type="button" class="panel-color-swatch" id="'+id+'" style="background:'+color+'" data-color="'+color+'"></button>'
}
function initColorSwatch(el, cb) {
  if (!el) return
  el.addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); showColorPopover(el, cb) })
}

/* ─── Geometry ─── */
function getRectEdgePoint(x, y, w, h, tx, ty) {
  const cx=x+w/2, cy=y+h/2, dx=tx-cx, dy=ty-cy
  if (Math.abs(dx)<0.001&&Math.abs(dy)<0.001) return {x:cx,y:cy}
  const hw=w/2, hh=h/2
  if (dx!==0) { const t=dx>0?hw/dx:-hw/dx; const ye=cy+dy*t; if (ye>=y&&ye<=y+h) return {x:cx+(dx>0?hw:-hw),y:ye} }
  const t=dy>0?hh/dy:-hh/dy
  return {x:cx+dx*t,y:cy+(dy>0?hh:-hh)}
}
function getNodeEdgePoint(node, tx, ty) {
  const cx=node.x+node.w/2, cy=node.y+node.h/2, dx=tx-cx, dy=ty-cy
  if (Math.abs(dx)<0.001&&Math.abs(dy)<0.001) return {x:cx,y:cy,side:'right'}
  const hw=node.w/2, hh=node.h/2
  if (dx!==0) { const t=dx>0?hw/dx:-hw/dx; const ye=cy+dy*t; if (ye>=node.y&&ye<=node.y+node.h) return {x:cx+(dx>0?hw:-hw),y:ye,side:dx>0?'right':'left'} }
  const t=dy>0?hh/dy:-hh/dy
  return {x:cx+dx*t,y:cy+(dy>0?hh:-hh),side:dy>0?'bottom':'top'}
}
function getPointOnBezier(x1,y1,cx1,cy1,cx2,cy2,x2,y2,t) {
  const mt=1-t, mt2=mt*mt, t2=t*t
  return {x:mt2*mt*x1+3*mt2*t*cx1+3*mt*t2*cx2+t2*t*x2,y:mt2*mt*y1+3*mt2*t*cy1+3*mt*t2*cy2+t2*t*y2}
}
function pointToLineDist(px,py,x1,y1,x2,y2) {
  const dx=x2-x1, dy=y2-y1, lenSq=dx*dx+dy*dy
  if (lenSq===0) return Math.hypot(px-x1,py-y1)
  let t=((px-x1)*dx+(py-y1)*dy)/lenSq; t=Math.max(0,Math.min(1,t))
  return Math.hypot(px-(x1+t*dx),py-(y1+t*dy))
}
function drawRoundedRect(ctx, x, y, w, h, r) {
  r=Math.max(0,Math.min(r,Math.min(w,h)/2))
  ctx.beginPath(); ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.quadraticCurveTo(x+w,y,x+w,y+r)
  ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h)
  ctx.lineTo(x+r,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-r); ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y); ctx.closePath()
}
function drawShapePath(ctx, shape) {
  const {x,y,w,h}=shape
  switch(shape.shapeType) {
    case 'circle': ctx.beginPath(); ctx.ellipse(x+w/2,y+h/2,w/2,h/2,0,0,Math.PI*2); break
    case 'triangle': ctx.beginPath(); ctx.moveTo(x+w/2,y); ctx.lineTo(x+w,y+h); ctx.lineTo(x,y+h); ctx.closePath(); break
    case 'diamond': ctx.beginPath(); ctx.moveTo(x+w/2,y); ctx.lineTo(x+w,y+h/2); ctx.lineTo(x+w/2,y+h); ctx.lineTo(x,y+h/2); ctx.closePath(); break
    default: ctx.beginPath(); drawRoundedRect(ctx,x,y,w,h,shape.cornerRadius||4)
  }
}

/* ─── Hit Testing ─── */
function hitTestShape(shape, wx, wy) {
  const {x,y,w,h}=shape
  switch(shape.shapeType) {
    case 'circle': { const cx=x+w/2,cy=y+h/2,rx=w/2,ry=h/2; return ((wx-cx)*(wx-cx))/(rx*rx)+((wy-cy)*(wy-cy))/(ry*ry)<=1 }
    case 'triangle': { const ax=x+w/2,ay=y,bx=x+w,by=y+h,cx2=x,cy2=y+h; const v0x=cx2-ax,v0y=cy2-ay,v1x=bx-ax,v1y=by-ay,v2x=wx-ax,v2y=wy-ay; const d00=v0x*v0x+v0y*v0y,d01=v0x*v1x+v0y*v1y,d11=v1x*v1x+v1y*v1y,d20=v2x*v0x+v2y*v0y,d21=v2x*v1x+v2y*v1y; const denom=d00*d11-d01*d01; const v=(d11*d20-d01*d21)/denom,u=(d00*d21-d01*d20)/denom; return u>=0&&v>=0&&u+v<=1 }
    case 'diamond': { const cx=x+w/2,cy=y+h/2; return Math.abs(wx-cx)/w+Math.abs(wy-cy)/h<=0.5 }
    default: return wx>=x&&wx<=x+w&&wy>=y&&wy<=y+h
  }
}
function hitTestTextBox(wx, wy) {
  for (let i=_canvasData.textBoxes.length-1; i>=0; i--) {
    const tb=_canvasData.textBoxes[i]
    if (wx>=tb.x&&wx<=tb.x+tb.w&&wy>=tb.y&&wy<=tb.y+tb.h) return i
  }
  return -1
}
function hitTestShapeEntity(wx, wy) {
  for (let i=_canvasData.shapes.length-1; i>=0; i--) {
    const s=_canvasData.shapes[i]
    if (hitTestShape(s, wx, wy)) return i
  }
  return -1
}
function hitTestArrowBody(wx, wy) {
  let best=-1, bestDist=8
  for (let i=0; i<_canvasData.arrows.length; i++) {
    const a=_canvasData.arrows[i]; if (a.locked) continue
    let x1=a.x1,y1=a.y1,x2=a.x2,y2=a.y2
    const d=pointToLineDist(wx,wy,x1,y1,x2,y2); if (d<bestDist) { bestDist=d; best=i }
  }
  return best
}
function hitTestArrowEnd(wx, wy) {
  for (let i=0; i<_canvasData.arrows.length; i++) {
    const a=_canvasData.arrows[i]; if (a.locked) continue
    if (Math.hypot(wx-a.x1,wy-a.y1)<14||Math.hypot(wx-a.x2,wy-a.y2)<14) return {arrowIdx:i}
  }
  return null
}
function hitTestConnector(wx, wy) {
  let best=-1, bestDist=10
  for (let i=0; i<_canvasData.connectors.length; i++) {
    const c=_canvasData.connectors[i]; if (c.locked) continue
    const d=pointToLineDist(wx,wy,c.x1,c.y1,c.x2,c.y2); if (d<bestDist) { bestDist=d; best=i }
  }
  return best
}
function hitTestConnection(wx, wy) {
  let best=-1, bestDist=10
  for (let ci=0; ci<_canvasData.connections.length; ci++) {
    const conn=_canvasData.connections[ci], ft=_canvasData.textBoxes[conn.from], tt=_canvasData.textBoxes[conn.to]
    if (!ft||!tt) continue
    const tcx=tt.x+tt.w/2,tcy=tt.y+tt.h/2, fp=getNodeEdgePoint(ft,tcx,tcy)
    const fcx=ft.x+ft.w/2,fcy=ft.y+ft.h/2, tp=getNodeEdgePoint(tt,fcx,fcy)
    const dx=tp.x-fp.x,dy=tp.y-fp.y,dist=Math.sqrt(dx*dx+dy*dy),cpDist=Math.min(dist*0.5,80)
    let cp1x=fp.x,cp1y=fp.y,cp2x=tp.x,cp2y=tp.y
    switch(fp.side){case'right':cp1x+=cpDist;break;case'left':cp1x-=cpDist;break;case'bottom':cp1y+=cpDist;break;case'top':cp1y-=cpDist;break}
    switch(tp.side){case'right':cp2x+=cpDist;break;case'left':cp2x-=cpDist;break;case'bottom':cp2y+=cpDist;break;case'top':cp2y-=cpDist;break}
    for (let s=0; s<=20; s++) {
      const t=s/20, pt=getPointOnBezier(fp.x,fp.y,cp1x,cp1y,cp2x,cp2y,tp.x,tp.y,t)
      const dd=Math.sqrt((wx-pt.x)**2+(wy-pt.y)**2); if (dd<bestDist) { bestDist=dd; best=ci }
    }
  }
  return best
}
function getTopHitAt(wx, wy) {
  const connI=hitTestConnection(wx,wy); if (connI!==-1) return {type:'connection',i:connI}
  const connHit=hitTestConnector(wx,wy); if (connHit!==-1) return {type:'connector',i:connHit}
  const arrowEH=hitTestArrowEnd(wx,wy); if (arrowEH) return {type:'arrow',i:arrowEH.arrowIdx}
  const arrowBH=hitTestArrowBody(wx,wy); if (arrowBH!==-1) return {type:'arrow',i:arrowBH}
  const tbI=hitTestTextBox(wx,wy); if (tbI!==-1) return {type:'textBox',i:tbI}
  const shapeI=hitTestShapeEntity(wx,wy); if (shapeI!==-1) return {type:'shape',i:shapeI}
  return null
}
function getEdgeAt(wx, wy, entities, margin) {
  margin=margin||(12/_ui.scale)
  for (let i=entities.length-1; i>=0; i--) {
    const e=entities[i]; if (e.locked) continue
    const ol=Math.abs(wx-e.x)<=margin, or2=Math.abs(wx-(e.x+e.w))<=margin
    const ot=Math.abs(wy-e.y)<=margin, ob=Math.abs(wy-(e.y+e.h))<=margin
    const inX=wx>=e.x-margin&&wx<=e.x+e.w+margin, inY=wy>=e.y-margin&&wy<=e.y+e.h+margin
    if (!inX||!inY) continue
    if (ol&&ot) return {idx:i,handle:'tl',cursor:'nw-resize'}; if (or2&&ot) return {idx:i,handle:'tr',cursor:'ne-resize'}
    if (ol&&ob) return {idx:i,handle:'bl',cursor:'sw-resize'}; if (or2&&ob) return {idx:i,handle:'br',cursor:'se-resize'}
    if (ol) return {idx:i,handle:'left',cursor:'ew-resize'}; if (or2) return {idx:i,handle:'right',cursor:'ew-resize'}
    if (ot) return {idx:i,handle:'top',cursor:'ns-resize'}; if (ob) return {idx:i,handle:'bottom',cursor:'ns-resize'}
  }
  return null
}

/* ─── Parent Tree ─── */
class ParentTree {
  constructor() { this._entities=new Map(); this._parent=new Map(); this._children=new Map(); this._dirty=new Set(); this._depths=new Map(); this._depthDirty=true }
  rebuildAll(shapes,textBoxes) {
    this._entities.clear(); this._parent.clear(); this._children.clear(); this._dirty.clear(); this._depths.clear(); this._depthDirty=true
    for (const s of shapes) this._entities.set('shape:'+s.id,{type:'shape',id:s.id,entity:s})
    for (const tb of textBoxes) this._entities.set('textBox:'+tb.id,{type:'textBox',id:tb.id,entity:tb})
    for (const [key,info] of this._entities) this._recomputeEntityParent(key,info.entity)
  }
  register(type,id,entity) { const key=type+':'+id; this._entities.set(key,{type,id,entity}); this._recomputeEntityParent(key,entity); this._depthDirty=true }
  unregister(type,id) {
    const key=type+':'+id; this._entities.delete(key); this._depths.delete(key); this._dirty.delete(key)
    const parentKey=this._parent.get(key)
    if (parentKey) { const sib=this._children.get(parentKey); if(sib)sib.delete(key); this._parent.delete(key) }
    const children=this._children.get(key)
    if (children) { for (const ck of children) { this._parent.delete(ck); this._dirty.add(ck); const info=this._entities.get(ck); if (info) { info.entity.parentId=null; info.entity.parentType=null } } this._children.delete(key) }
    this._depthDirty=true
  }
  markDirty(type,id) { this._dirty.add(type+':'+id) }
  recomputeDirty() {
    if (this._dirty.size===0) return
    for (const key of this._dirty) { const info=this._entities.get(key); if (!info) continue; const old=this._parent.get(key); if (old) { const sib=this._children.get(old); if(sib)sib.delete(key); this._parent.delete(key) }; this._recomputeEntityParent(key,info.entity) }
    this._dirty.clear(); this._depthDirty=true
  }
  getDrawOrder() {
    this._ensureDepths(); const items=[]
    for (let i=0; i<_canvasData.shapes.length; i++) { const d=this._depths.get('shape:'+_canvasData.shapes[i].id)||0; items.push({type:'shape',i,area:_canvasData.shapes[i].w*_canvasData.shapes[i].h,depth:d}) }
    for (let i=0; i<_canvasData.textBoxes.length; i++) { const d=this._depths.get('textBox:'+_canvasData.textBoxes[i].id)||0; items.push({type:'textBox',i,area:_canvasData.textBoxes[i].w*_canvasData.textBoxes[i].h,depth:d}) }
    items.sort((a,b)=>a.depth===b.depth?a.i-b.i:a.depth-b.depth); return items
  }
  getDescendants(type,id) {
    const results=[], stack=[type+':'+id], seen=new Set()
    while(stack.length>0) { const key=stack.pop(); if(seen.has(key))continue; seen.add(key); const children=this._children.get(key); if(children) for(const ck of children) { if(!seen.has(ck)) { const idx=ck.indexOf(':'); results.push({type:ck.substring(0,idx),id:parseInt(ck.substring(idx+1),10)}); stack.push(ck) } } }
    return results
  }
  _ensureDepths() { if(!this._depthDirty) return; this._depths.clear(); for(const key of this._entities.keys()) this._computeDepth(key,new Set()); this._depthDirty=false }
  _computeDepth(key,visiting) {
    if(this._depths.has(key)) return this._depths.get(key)
    const parentKey=this._parent.get(key); if(!parentKey) { this._depths.set(key,0); return 0 }
    if(visiting.has(key)) { this._depths.set(key,0); return 0 }
    visiting.add(key); const pd=this._computeDepth(parentKey,visiting); visiting.delete(key)
    const d=pd+1; this._depths.set(key,d); return d
  }
  _recomputeEntityParent(key, entity) {
    entity.parentId=null; entity.parentType=null
    const old=this._parent.get(key); if(old) { const sib=this._children.get(old); if(sib)sib.delete(key); this._parent.delete(key) }
    const pi=this._findParent(entity); if(pi) { const pk=pi.type+':'+pi.id; if(!this._wouldCreateCycle(key,pk)) { this._parent.set(key,pk); if(!this._children.has(pk)) this._children.set(pk,new Set()); this._children.get(pk).add(key); entity.parentId=pi.id; entity.parentType=pi.type } }
  }
  _findParent(entity) { let best=null, bestArea=Infinity; for(const[key,info] of this._entities) { if(info.entity===entity) continue; const p=info.entity, a=p.w*p.h; if(a<bestArea&&p.x<=entity.x&&p.y<=entity.y&&p.x+p.w>=entity.x+entity.w&&p.y+p.h>=entity.y+entity.h) { best=key; bestArea=a } } if(!best) return null; const idx=best.indexOf(':'); return {type:best.substring(0,idx),id:parseInt(best.substring(idx+1),10)} }
  _wouldCreateCycle(childKey,potentialParentKey) { let current=this._parent.get(potentialParentKey); while(current) { if(current===childKey) return true; current=this._parent.get(current) } return false }
}

/* ─── Grid Constants ─── */
const GRID_CONFIG = {
  gridLevels: [
    { spacing: 10, weight: 0.6, minPx: 8, peakPx: 24, maxPx: 70 },
    { spacing: 40, weight: 0.8, minPx: 10, peakPx: 28, maxPx: 80 },
    { spacing: 200, weight: 1.1, minPx: 16, peakPx: 60, maxPx: 180 },
    { spacing: 1000, weight: 1.4, minPx: 24, peakPx: 100, maxPx: 320 },
  ]
}
function gridOpacity(vpx, minPx, peakPx, maxPx) {
  if (vpx<minPx||vpx>maxPx) return 0
  if (vpx<=peakPx) return (vpx-minPx)/(peakPx-minPx)
  return 1-(vpx-peakPx)/(maxPx-peakPx)
}
function getSnapIncrement() {
  for (const l of GRID_CONFIG.gridLevels) { const vpx=l.spacing*_ui.scale; if (vpx>=l.minPx&&vpx<=l.maxPx) return l.spacing }
  return GRID_CONFIG.gridLevels[GRID_CONFIG.gridLevels.length-1].spacing
}
function snapValue(v, inc) { return Math.round(v/inc)*inc }

/* ─── Tools ─── */
const TOOLS = { CURSOR:'cursor', TEXT:'text', SHAPES:'shapes', ARROW:'arrow', CONNECTION_LINE:'connection', IMAGE_CONTAINER:'imageContainer' }

/* ─── State ─── */
let _ui = null

function getEmptyCanvasData() {
  return { textBoxes:[], shapes:[], arrows:[], connectors:[], connections:[], viewport:{offsetX:0,offsetY:0,scale:1}, nextTextBoxId:1, nextShapeId:1, nextArrowId:1, nextConnectorId:1, nextConnectionId:1 }
}

/* ─── Grid Drawing ─── */
function drawGrid(ctx, w, h) {
  const {offsetX, offsetY, scale}=_ui, bg=getThemeBg()
  ctx.fillStyle=bg; ctx.fillRect(0,0,w,h)
  if (!_cachedGridRgb) _cachedGridRgb=hexToRgb(getComputedStyle(document.documentElement).getPropertyValue('--border').trim()||'#2a2a40'); const gridRgb=_cachedGridRgb
  for (const lvl of GRID_CONFIG.gridLevels) {
    const vpx=lvl.spacing*scale, alpha=gridOpacity(vpx,lvl.minPx,lvl.peakPx,lvl.maxPx)*lvl.weight*0.45
    if (alpha<=0) continue
    ctx.strokeStyle='rgba('+gridRgb[0]+','+gridRgb[1]+','+gridRgb[2]+','+alpha+')'; ctx.lineWidth=1; ctx.beginPath()
    const sx=offsetX%(lvl.spacing*scale), sy=offsetY%(lvl.spacing*scale)
    for (let x=sx; x<w; x+=lvl.spacing*scale) { ctx.moveTo(x,0); ctx.lineTo(x,h) }
    for (let y=sy; y<h; y+=lvl.spacing*scale) { ctx.moveTo(0,y); ctx.lineTo(w,y) }
    ctx.stroke()
  }
}

/* ─── Entity Drawing ─── */
function drawEntities() {
  const canvas=_ui.mainCanvas, ctx=canvas.getContext('2d'), dpr=window.devicePixelRatio||1
  ctx.save(); ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0,0,canvas.width,canvas.height); ctx.setTransform(dpr,0,0,dpr,0,0)
  drawGrid(ctx, canvas.width/dpr, canvas.height/dpr)
  ctx.translate(_ui.offsetX, _ui.offsetY); ctx.scale(_ui.scale, _ui.scale)

  const cw=canvas.width/dpr, ch=canvas.height/dpr, margin=200
  const vl=(-_ui.offsetX-margin)/_ui.scale, vt=(-_ui.offsetY-margin)/_ui.scale
  const vr=(cw-_ui.offsetX+margin)/_ui.scale, vb=(ch-_ui.offsetY+margin)/_ui.scale

  const drawOrder=_parentTree.getDrawOrder()
  for (const item of drawOrder) {
    if (item.type==='shape') {
      const s=_canvasData.shapes[item.i]; if (!s||s.x+s.w<vl||s.x>vr||s.y+s.h<vt||s.y>vb) continue
      drawShape(s, item.i)
    } else {
      const tb=_canvasData.textBoxes[item.i]; if (!tb||tb.x+tb.w<vl||tb.x>vr||tb.y+tb.h<vt||tb.y>vb) continue
      drawTextBox(tb, item.i)
    }
  }

  if (_ui.isSelectingBox) {
    ctx.save(); ctx.fillStyle='rgba(79,70,229,0.08)'; const x=Math.min(_ui.boxStartX,_ui.boxEndX), y=Math.min(_ui.boxStartY,_ui.boxEndY)
    const w=Math.abs(_ui.boxEndX-_ui.boxStartX), h2=Math.abs(_ui.boxEndY-_ui.boxStartY)
    ctx.fillRect(x,y,w,h2); ctx.strokeStyle=getAccentColor(); ctx.lineWidth=1/_ui.scale; ctx.setLineDash([5/_ui.scale,5/_ui.scale]); ctx.strokeRect(x,y,w,h2); ctx.restore()
  }

  if (_ui.activeTool===TOOLS.SHAPES&&_ui.drawingPreview) {
    const dp=_ui.drawingPreview; ctx.save(); ctx.fillStyle='rgba(79,70,229,0.25)'; ctx.strokeStyle=getAccentColor()
    ctx.lineWidth=3/_ui.scale; ctx.setLineDash([6/_ui.scale,4/_ui.scale])
    if (dp.shapeType==='circle') { ctx.beginPath(); ctx.ellipse(dp.x+dp.w/2,dp.y+dp.h/2,dp.w/2,dp.h/2,0,0,Math.PI*2) }
    else if (dp.shapeType==='triangle') { ctx.beginPath(); ctx.moveTo(dp.x+dp.w/2,dp.y); ctx.lineTo(dp.x+dp.w,dp.y+dp.h); ctx.lineTo(dp.x,dp.y+dp.h); ctx.closePath() }
    else if (dp.shapeType==='diamond') { ctx.beginPath(); ctx.moveTo(dp.x+dp.w/2,dp.y); ctx.lineTo(dp.x+dp.w,dp.y+dp.h/2); ctx.lineTo(dp.x+dp.w/2,dp.y+dp.h); ctx.lineTo(dp.x,dp.y+dp.h/2); ctx.closePath() }
    else drawRoundedRect(ctx,dp.x,dp.y,dp.w,dp.h,4)
    ctx.fill(); ctx.stroke(); ctx.setLineDash([]); ctx.restore()
  }
  if (_ui.activeTool===TOOLS.TEXT&&_ui.drawingPreview) {
    const dp=_ui.drawingPreview; ctx.save(); ctx.fillStyle='rgba(79,70,229,0.2)'; ctx.strokeStyle=getAccentColor()
    ctx.lineWidth=3/_ui.scale; ctx.setLineDash([6/_ui.scale,4/_ui.scale]); drawRoundedRect(ctx,dp.x,dp.y,dp.w,dp.h,6)
    ctx.fill(); ctx.stroke(); ctx.setLineDash([]); ctx.restore()
  }
  if (_ui.activeTool===TOOLS.IMAGE_CONTAINER&&_ui.drawingPreview) {
    const dp=_ui.drawingPreview; ctx.save(); ctx.fillStyle='rgba(79,70,229,0.2)'; ctx.strokeStyle=getAccentColor()
    ctx.lineWidth=3/_ui.scale; ctx.setLineDash([6/_ui.scale,4/_ui.scale]); ctx.strokeRect(dp.x,dp.y,dp.w,dp.h)
    ctx.stroke(); ctx.setLineDash([]); ctx.restore()
  }

  ctx.restore()
}

function drawShape(shape, idx) {
  const ctx=_ui.mainCanvas.getContext('2d'), dpr=window.devicePixelRatio||1
  ctx.save()
  const sel=_ui.selectedShapes.has(idx), borderColor=shape.borderColor||getAccentColor()
  ctx.fillStyle=shape.color||getPanelBg(); ctx.strokeStyle=borderColor
  ctx.lineWidth=(shape.borderWidth||2)/_ui.scale
  drawShapePath(ctx, shape); ctx.fill(); ctx.stroke()

  if (shape.image) {
    if (!shape._img||shape._img._src!==shape.image) {
      const img=new Image(); img.src=shape.image; img._src=shape.image
      img.onload=()=>{ shape._img=img }; shape._img=img
    }
    if (shape._img&&shape._img.complete&&shape._img.naturalWidth>0) {
      ctx.save(); drawShapePath(ctx, shape); ctx.clip(); ctx.drawImage(shape._img, shape.x, shape.y, shape.w, shape.h); ctx.restore()
      ctx.save(); drawShapePath(ctx, shape); ctx.stroke(); ctx.restore()
    }
  }

  if (sel) {
    ctx.save(); ctx.strokeStyle=getAccentColor(); ctx.lineWidth=2/_ui.scale; ctx.setLineDash([])
    drawShapePath(ctx, shape); ctx.stroke()
    drawResizeHandles(ctx, shape, dpr)
    if (!shape.locked) {
      const lx=shape.x+shape.w/2-10, ly=shape.y-14, lw=20, lh=12
      ctx.fillStyle='rgba(0,0,0,0.7)'; ctx.fillRect(lx,ly,lw,lh)
      ctx.fillStyle='#fff'; ctx.font='8px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('\u{1F512}',lx+lw/2,ly+lh/2)
    }
    ctx.restore()
  }
  ctx.restore()
}

function drawTextBox(tb, idx) {
  const ctx=_ui.mainCanvas.getContext('2d'), dpr=window.devicePixelRatio||1
  ctx.save()
  const sel=_ui.selectedTextBoxes.has(idx)
  ctx.fillStyle=tb.color||'#1a1a1a'; ctx.strokeStyle=tb.borderColor||'#444'
  ctx.lineWidth=2/_ui.scale; drawRoundedRect(ctx,tb.x,tb.y,tb.w,tb.h,6); ctx.fill(); ctx.stroke()

  if (sel) {
    ctx.save(); ctx.strokeStyle=getAccentColor(); ctx.lineWidth=2/_ui.scale; drawRoundedRect(ctx,tb.x,tb.y,tb.w,tb.h,6); ctx.stroke()
    drawResizeHandles(ctx, tb, dpr); ctx.restore()
  }
  ctx.restore()
}

/* ─── Persistent Text Box Overlays ─── */
function createTextBoxOverlay(tb) {
  if (_ui._textBoxOverlays.has(tb.id)) return
  const s=_ui.scale, fs=tb.fontSize||14
  const el=document.createElement('div'); el.className='canvas-inline-editor'
  el.style.cssText='position:absolute;background:'+(tb.color||'#1a1a1a')+';border:2px solid transparent;border-radius:'+Math.round(6*s)+'px;padding:'+Math.round(6*s)+'px;z-index:100;box-sizing:border-box;'
  const titleInput=document.createElement('input'); titleInput.value=tb.title||''; titleInput.placeholder='Title'; titleInput.style.cssText='display:block;width:100%;border:none;background:transparent;color:'+(tb.titleColor||'#e7e7e7')+';font-size:'+Math.round((fs+2)*s)+'px;font-weight:bold;outline:none;margin-bottom:'+Math.round(4*s)+'px;padding:'+Math.round(2*s)+'px '+Math.round(4*s)+'px;box-sizing:border-box;'
  const textArea=document.createElement('textarea'); textArea.value=tb.text||''; textArea.placeholder='Content...'; textArea.style.cssText='display:block;width:100%;border:none;background:transparent;color:'+(tb.textColor||'#ddd')+';font-size:'+Math.round(fs*s)+'px;resize:none;outline:none;font-family:system-ui,sans-serif;min-height:'+Math.round(60*s)+'px;padding:'+Math.round(2*s)+'px '+Math.round(4*s)+'px;box-sizing:border-box;'
  el.appendChild(titleInput); el.appendChild(textArea)
  _ui.entityLayer.appendChild(el)
  const o={el,titleInput,textArea}
  _ui._textBoxOverlays.set(tb.id,o)
  wireOverlayInput(tb,o)
}
function removeTextBoxOverlay(tbId) {
  const o=_ui._textBoxOverlays.get(tbId); if(!o) return
  o.el.remove(); _ui._textBoxOverlays.delete(tbId)
}
function updateTextBoxOverlays() {
  const ids=new Set(_canvasData.textBoxes.map(t=>t.id))
  for (const [id] of _ui._textBoxOverlays) { if (!ids.has(id)) removeTextBoxOverlay(id) }
  for (const tb of _canvasData.textBoxes) {
    if (!_ui._textBoxOverlays.has(tb.id)) createTextBoxOverlay(tb)
    const o=_ui._textBoxOverlays.get(tb.id); if(!o) continue
    const sp=worldToScreen(tb.x,tb.y), s=_ui.scale, fs=tb.fontSize||14
    o.el.style.left=sp.x+'px'; o.el.style.top=sp.y+'px'; o.el.style.width=(tb.w*s)+'px'; o.el.style.height=(tb.h*s)+'px'
    o.el.style.background=tb.color||'#1a1a1a'
    o.el.style.borderRadius=Math.round(6*s)+'px'; o.el.style.padding=Math.round(6*s)+'px'
    o.el.style.border='2px solid '+(tb.locked?'transparent':getAccentColor())
    o.titleInput.style.fontSize=Math.round((fs+2)*s)+'px'; o.titleInput.style.color=tb.titleColor||'#e7e7e7'
    o.titleInput.style.marginBottom=Math.round(4*s)+'px'; o.titleInput.style.padding=Math.round(2*s)+'px '+Math.round(4*s)+'px'
    o.textArea.style.fontSize=Math.round(fs*s)+'px'; o.textArea.style.color=tb.textColor||'#ddd'
    o.textArea.style.minHeight=Math.round(60*s)+'px'; o.textArea.style.padding=Math.round(2*s)+'px '+Math.round(4*s)+'px'
    o.titleInput.disabled=tb.locked; o.textArea.disabled=tb.locked
  }
}

function drawResizeHandles(ctx, entity, dpr) {
  const hw=Math.min(8,entity.w/3,entity.h/3), h=hw/_ui.scale, fill=getAccentColor(), stroke='#fff'
  const positions=[{x:entity.x-h/2,y:entity.y-h/2},{x:entity.x+entity.w-h/2,y:entity.y-h/2},{x:entity.x+entity.w-h/2,y:entity.y+entity.h-h/2},{x:entity.x-h/2,y:entity.y+entity.h-h/2},{x:entity.x+entity.w/2-h/2,y:entity.y-h/2},{x:entity.x+entity.w/2-h/2,y:entity.y+entity.h-h/2},{x:entity.x-h/2,y:entity.y+entity.h/2-h/2},{x:entity.x+entity.w-h/2,y:entity.y+entity.h/2-h/2}]
  for (const p of positions) { ctx.fillStyle=fill; ctx.fillRect(p.x-0.5,p.y-0.5,h+1,h+1); ctx.fillStyle=fill; ctx.fillRect(p.x,p.y,h,h) }
}

/* ─── Arrows / Connectors / Connections ─── */
function drawArrowsAndConnectors() {
  const canvas=_ui.arrowCanvas, ctx=canvas.getContext('2d'), dpr=window.devicePixelRatio||1
  ctx.save(); ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0,0,canvas.width,canvas.height); ctx.setTransform(dpr,0,0,dpr,0,0)
  ctx.translate(_ui.offsetX, _ui.offsetY); ctx.scale(_ui.scale, _ui.scale)

  for (let i=0; i<_canvasData.arrows.length; i++) drawArrow(i)
  for (let i=0; i<_canvasData.connectors.length; i++) drawConnector(i)
  for (let i=0; i<_canvasData.connections.length; i++) drawConnection(i)
  if (_ui.connectingFrom!==null) drawConnectionPreview(_ui.connectingFrom, _ui.connectingMouseWorld)
  else if (_ui.isDrawing&&_ui.activeTool===TOOLS.ARROW) drawArrowPreview(_ui.drawingStartX,_ui.drawingStartY,_ui.lastWorldMouse.x,_ui.lastWorldMouse.y)
  else if (_ui.isDrawing&&_ui.activeTool===TOOLS.CONNECTION_LINE) drawConnectorPreview(_ui.drawingStartX,_ui.drawingStartY,_ui.lastWorldMouse.x,_ui.lastWorldMouse.y)
  ctx.restore()
}

function drawArrow(idx) {
  const ctx=_ui.arrowCanvas.getContext('2d'), dpr=window.devicePixelRatio||1, a=_canvasData.arrows[idx]
  let x1=a.x1,y1=a.y1,x2=a.x2,y2=a.y2
  if (a.connectedFrom!==null) { const arr=a.connectedFromType==='shape'?_canvasData.shapes:_canvasData.textBoxes; const t=arr[a.connectedFrom]; if(t){ const p=getRectEdgePoint(t.x,t.y,t.w,t.h,x2,y2); x1=p.x;y1=p.y } }
  if (a.connectedTo!==null) { const arr=a.connectedToType==='shape'?_canvasData.shapes:_canvasData.textBoxes; const t=arr[a.connectedTo]; if(t){ const p=getRectEdgePoint(t.x,t.y,t.w,t.h,x1,y1); x2=p.x;y2=p.y } }
  const sel=_ui.selectedArrows.has(idx), color=a.color||'#6bb5ff', lw=(a.lineWidth||2)/_ui.scale
  ctx.save(); ctx.strokeStyle=color; ctx.lineWidth=sel?lw*1.5:lw; ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke()
  const angle=Math.atan2(y2-y1,x2-x1), hLen=(a.headSize||14)/_ui.scale, hAng=Math.PI/6
  ctx.beginPath(); ctx.moveTo(x2,y2); ctx.lineTo(x2-hLen*Math.cos(angle-hAng),y2-hLen*Math.sin(angle-hAng)); ctx.lineTo(x2-hLen*Math.cos(angle+hAng),y2-hLen*Math.sin(angle+hAng)); ctx.closePath()
  ctx.fillStyle=color; ctx.fill()
  if (sel) { ctx.beginPath(); ctx.arc(x1,y1,6/_ui.scale,0,Math.PI*2); ctx.fillStyle=color; ctx.fill(); ctx.beginPath(); ctx.arc(x2,y2,6/_ui.scale,0,Math.PI*2); ctx.fill() }
  ctx.restore()
}

function drawConnector(idx) {
  const ctx=_ui.arrowCanvas.getContext('2d'), c=_canvasData.connectors[idx]
  let x1=c.x1,y1=c.y1,x2=c.x2,y2=c.y2
  if (c.connectedFrom!==null) { const arr=c.connectedFromType==='shape'?_canvasData.shapes:_canvasData.textBoxes; const t=arr[c.connectedFrom]; if(t){ const p=getRectEdgePoint(t.x,t.y,t.w,t.h,x2,y2); x1=p.x;y1=p.y } }
  if (c.connectedTo!==null) { const arr=c.connectedToType==='shape'?_canvasData.shapes:_canvasData.textBoxes; const t=arr[c.connectedTo]; if(t){ const p=getRectEdgePoint(t.x,t.y,t.w,t.h,x1,y1); x2=p.x;y2=p.y } }
  const sel=_ui.selectedConnectors.has(idx), color=c.color||'#6bb5ff'
  ctx.save(); ctx.strokeStyle=color; ctx.lineWidth=2/_ui.scale; ctx.setLineDash([6/_ui.scale,4/_ui.scale]); ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke(); ctx.setLineDash([])
  ctx.beginPath(); ctx.arc(x1,y1,4/_ui.scale,0,Math.PI*2); ctx.fillStyle=color; ctx.fill()
  ctx.beginPath(); ctx.arc(x2,y2,4/_ui.scale,0,Math.PI*2); ctx.fill()
  ctx.restore()
}

function drawConnection(idx) {
  const ctx=_ui.arrowCanvas.getContext('2d'), dpr=window.devicePixelRatio||1, conn=_canvasData.connections[idx]
  const ft=_canvasData.textBoxes[conn.from], tt=_canvasData.textBoxes[conn.to]; if (!ft||!tt) return
  const tcx=tt.x+tt.w/2,tcy=tt.y+tt.h/2, fp=getNodeEdgePoint(ft,tcx,tcy)
  const fcx=ft.x+ft.w/2,fcy=ft.y+ft.h/2, tp=getNodeEdgePoint(tt,fcx,fcy)
  const dx2=tp.x-fp.x,dy2=tp.y-fp.y,dist=Math.sqrt(dx2*dx2+dy2*dy2),cpDist=Math.min(dist*0.5,80)
  let cp1x=fp.x,cp1y=fp.y,cp2x=tp.x,cp2y=tp.y
  switch(fp.side){case'right':cp1x+=cpDist;break;case'left':cp1x-=cpDist;break;case'bottom':cp1y+=cpDist;break;case'top':cp1y-=cpDist;break}
  switch(tp.side){case'right':cp2x+=cpDist;break;case'left':cp2x-=cpDist;break;case'bottom':cp2y+=cpDist;break;case'top':cp2y-=cpDist;break}
  const sel=_ui.selectedConnection===idx, color=conn.color||'#6bb5ff'
  ctx.save(); ctx.strokeStyle=color; ctx.lineWidth=sel?3/_ui.scale:2/_ui.scale; ctx.beginPath(); ctx.moveTo(fp.x,fp.y); ctx.bezierCurveTo(cp1x,cp1y,cp2x,cp2y,tp.x,tp.y); ctx.stroke()
  if (conn.text&&conn.text.length>0) {
    const mid=getPointOnBezier(fp.x,fp.y,cp1x,cp1y,cp2x,cp2y,tp.x,tp.y,0.5)
    ctx.font='bold 13px system-ui,sans-serif'; const tw=ctx.measureText(conn.text).width, th=13+4, pad=6
    const rx=-tw/2-pad, ry=-th/2, bw=tw+pad*2, bh=th
    ctx.save(); ctx.translate(mid.x,mid.y); drawRoundedRect(ctx,rx,ry,bw,bh,6); ctx.fillStyle='rgba(0,0,0,0.85)'; ctx.fill(); ctx.strokeStyle='#f0c800'; ctx.lineWidth=1/_ui.scale; ctx.stroke()
    ctx.fillStyle='#fff'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(conn.text,0,0); ctx.restore()
  }
  ctx.restore()
}

function drawConnectionPreview(fromHit, mouseWorld) {
  const ctx=_ui.arrowCanvas.getContext('2d'), dpr=window.devicePixelRatio||1
  const arr=fromHit.type==='shape'?_canvasData.shapes:_canvasData.textBoxes
  const ft=arr[fromHit.i]; if (!ft) return
  const fp=getNodeEdgePoint(ft,mouseWorld.x,mouseWorld.y)
  ctx.save(); ctx.strokeStyle='rgba(79,70,229,0.5)'; ctx.lineWidth=2/_ui.scale; ctx.setLineDash([6/_ui.scale,4/_ui.scale]); ctx.beginPath(); ctx.moveTo(fp.x,fp.y); ctx.lineTo(mouseWorld.x,mouseWorld.y); ctx.stroke(); ctx.setLineDash([]); ctx.restore()
}
function drawArrowPreview(x1, y1, x2, y2) {
  const ctx=_ui.arrowCanvas.getContext('2d'), dpr=window.devicePixelRatio||1
  ctx.save(); ctx.strokeStyle='rgba(79,70,229,0.5)'; ctx.lineWidth=2/_ui.scale; ctx.setLineDash([6/_ui.scale,4/_ui.scale])
  ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke(); ctx.setLineDash([])
  const angle=Math.atan2(y2-y1,x2-x1), hLen=14/_ui.scale, hAng=Math.PI/6
  ctx.fillStyle='rgba(79,70,229,0.5)'; ctx.beginPath(); ctx.moveTo(x2,y2); ctx.lineTo(x2-hLen*Math.cos(angle-hAng),y2-hLen*Math.sin(angle-hAng)); ctx.lineTo(x2-hLen*Math.cos(angle+hAng),y2-hLen*Math.sin(angle+hAng)); ctx.closePath(); ctx.fill()
  ctx.restore()
}
function drawConnectorPreview(x1, y1, x2, y2) {
  const ctx=_ui.arrowCanvas.getContext('2d'), dpr=window.devicePixelRatio||1
  ctx.save(); ctx.strokeStyle='rgba(79,70,229,0.5)'; ctx.lineWidth=2/_ui.scale; ctx.setLineDash([6/_ui.scale,4/_ui.scale])
  ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke(); ctx.setLineDash([])
  ctx.beginPath(); ctx.arc(x1,y1,4/_ui.scale,0,Math.PI*2); ctx.fillStyle='rgba(79,70,229,0.5)'; ctx.fill()
  ctx.beginPath(); ctx.arc(x2,y2,4/_ui.scale,0,Math.PI*2); ctx.fill()
  ctx.restore()
}

/* ─── Main Entry ─── */
export function isCanvasActive() { return _renderedCanvasId !== null }

export function renderCanvasView(canvasId) {
  if (_renderedCanvasId===canvasId) return
  if (_renderedCanvasId) destroyCanvas()
  const area=document.getElementById('boardArea')
  _currentCanvasId=canvasId
  const c=findCanvas(canvasId); if (!c) return
  if (!c.data) c.data=getEmptyCanvasData()
  if (!c.data.textBoxes) c.data.textBoxes=[]; if (!c.data.shapes) c.data.shapes=[]
  if (!c.data.arrows) c.data.arrows=[]; if (!c.data.connectors) c.data.connectors=[]
  if (!c.data.connections) c.data.connections=[]
  if (!c.data.viewport) c.data.viewport={offsetX:0,offsetY:0,scale:1}
  _canvasData=c.data; _history=createHistoryManager()
  _parentTree=new ParentTree(); _parentTree.rebuildAll(_canvasData.shapes,_canvasData.textBoxes)

  area.innerHTML=''; area.style.padding='0'; area.style.overflow='hidden'; area.style.position='relative'; area.style.background=getThemeBg()

  const container=document.createElement('div')
  container.id='canvasContainer-'+canvasId
  container.style.cssText='width:100%;height:100%;display:flex;flex-direction:column;position:relative;'

  const header=document.createElement('div')
  header.style.cssText='display:flex;align-items:center;gap:12px;padding:8px 16px;background:var(--bg-topbar);border-bottom:1px solid var(--border-light);flex-shrink:0;min-height:40px;'
  header.innerHTML='<h2 class="document-title" id="canvasTitle-'+canvasId+'" style="display:none" ondblclick="startRenameCanvas(\''+canvasId+'\')">'+c.name+'</h2>'
  header.innerHTML+='<div style="flex:1;"></div>'
  header.innerHTML+='<div class="canvas-actions">'
  header.innerHTML+='<button id="canvasUndoBtn" title="Undo (Ctrl+Z)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg></button>'
  header.innerHTML+='<button id="canvasRedoBtn" title="Redo (Ctrl+Shift+Z)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg></button>'
  header.innerHTML+='<button id="canvasDeleteBtn" title="Delete selected (Del)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>'
  header.innerHTML+='<button id="canvasFitBtn" title="Fit all / Fit selected (F)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg></button>'
  header.innerHTML+='</div>'; container.appendChild(header)

  const body=document.createElement('div'); body.style.cssText='flex:1;display:flex;flex-direction:row;position:relative;min-height:0;'
  const sideToolbar=buildToolbar(canvasId); body.appendChild(sideToolbar)
  const canvasArea=document.createElement('div'); canvasArea.id='canvasArea-'+canvasId; canvasArea.style.cssText='flex:1;position:relative;overflow:hidden;cursor:default;'
  const mainCanvas=document.createElement('canvas'); mainCanvas.id='canvasMain-'+canvasId; mainCanvas.style.cssText='position:absolute;top:0;left:0;width:100%;height:100%;display:block;'; canvasArea.appendChild(mainCanvas)
  const arrowCanvas=document.createElement('canvas'); arrowCanvas.id='canvasArrow-'+canvasId; arrowCanvas.style.cssText='position:absolute;top:0;left:0;width:100%;height:100%;display:block;pointer-events:none;'; canvasArea.appendChild(arrowCanvas)
  const entityLayer=document.createElement('div'); entityLayer.id='canvasEntityLayer-'+canvasId; entityLayer.style.cssText='position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:hidden;z-index:1;'; canvasArea.appendChild(entityLayer)
  body.appendChild(canvasArea)
  const sidePanel=document.createElement('div'); sidePanel.id='canvasSidePanel-'+canvasId; sidePanel.className='canvas-side-panel'; sidePanel.innerHTML='<div class="canvas-panel-empty">No selection</div>'; body.appendChild(sidePanel)
  const contextMenu=document.createElement('div'); contextMenu.id='canvasContextMenu-'+canvasId; contextMenu.className='canvas-context-menu'; contextMenu.style.display='none'; body.appendChild(contextMenu)
  container.appendChild(body); area.appendChild(container)

  _ui={ container,body,canvasArea,mainCanvas,arrowCanvas,entityLayer,sidePanel,sideToolbar,contextMenu,
    offsetX:_canvasData.viewport?.offsetX||0, offsetY:_canvasData.viewport?.offsetY||0, scale:_canvasData.viewport?.scale||1,
    targetOffsetX:_canvasData.viewport?.offsetX||0, targetOffsetY:_canvasData.viewport?.offsetY||0, targetScale:_canvasData.viewport?.scale||1,
    activeTool:TOOLS.CURSOR, shapeSubType:'rectangle', isPanning:false, lastPanX:0,lastPanY:0,
    isDragging:false, dragStartX:0,dragStartY:0,
    isDrawing:false,
    isResizing:false, resizeHandle:'', resizeEntityType:null, resizeEntityIdx:-1, resizeStartBounds:null,
    _textBoxOverlays:new Map(),
    selectedTextBoxes:new Set(), selectedShapes:new Set(), selectedArrows:new Set(), selectedConnectors:new Set(), selectedConnection:null,
    connectingFrom:null, connectingMouseWorld:{x:0,y:0}, arrowDragTarget:null, isDraggingArrowEnd:false, dragArrowEndSnapshot:null,
    drawingStartX:0,drawingStartY:0, drawingPreview:null,
    isSelectingBox:false, boxStartX:0,boxStartY:0,boxEndX:0,boxEndY:0,
    lastWorldMouse:{x:0,y:0},
    nextTextBoxId:_canvasData.nextTextBoxId||1, nextShapeId:_canvasData.nextShapeId||1, nextArrowId:_canvasData.nextArrowId||1, nextConnectorId:_canvasData.nextConnectorId||1, nextConnectionId:_canvasData.nextConnectionId||1,
    clipboard:[], _dragState:[], rmbDownTime:0, rmbMoved:false, rmbPending:false,
  }
  _ctx=_ui.mainCanvas.getContext('2d'); _arrowCtx=_ui.arrowCanvas.getContext('2d')

  wireEvents(); resizeCanvases(); updateToolUI()
  document.getElementById('canvasUndoBtn')?.addEventListener('click',()=>performUndo())
  document.getElementById('canvasRedoBtn')?.addEventListener('click',()=>performRedo())
  document.getElementById('canvasDeleteBtn')?.addEventListener('click',()=>deleteSelected())
  document.getElementById('canvasFitBtn')?.addEventListener('click',()=>{ focusOnSelected()||focusOnAll() })
  _renderedCanvasId=canvasId; _renderDirty=true; animate()
}

function buildToolbar(canvasId) {
  const sideToolbar=document.createElement('div'); sideToolbar.className='canvas-side-toolbar'; sideToolbar.id='canvasSideToolbar-'+canvasId
  const toolSvgs={ cursor:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/><path d="M13 13l6 6"/></svg>',
    text:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7V4h16v3"/><path d="M9 20h6"/><line x1="12" y1="4" x2="12" y2="20"/></svg>',
    arrow:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 19L19 5"/><path d="M12 5h7v7"/></svg>',
    connection:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="4" y1="20" x2="20" y2="4"/><circle cx="4" cy="20" r="1.5" fill="currentColor"/><circle cx="20" cy="4" r="1.5" fill="currentColor"/></svg>',
    imageContainer:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><rect x="7" y="7" width="10" height="10" rx="1"/><circle cx="10" cy="10" r="1" fill="currentColor"/></svg>',
    rectangle:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>',
    circle2:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="9"/></svg>',
    triangle:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2l10 20H2z"/></svg>',
    diamond:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2l10 10-10 10L2 12z"/></svg>' }
  const toolBtnMap={}
  const toolbarTools=[{tool:TOOLS.CURSOR,svg:toolSvgs.cursor,label:'Select (V)'},{tool:TOOLS.TEXT,svg:toolSvgs.text,label:'Text Box (T)'},{tool:TOOLS.SHAPES,svg:toolSvgs.rectangle,label:'Shapes',hasSubmenu:true},{tool:TOOLS.ARROW,svg:toolSvgs.arrow,label:'Arrow (A)'},{tool:TOOLS.CONNECTION_LINE,svg:toolSvgs.connection,label:'Connector (C)'},{tool:TOOLS.IMAGE_CONTAINER,svg:toolSvgs.imageContainer,label:'Image Container'}]
  for (const t of toolbarTools) {
    if (t.hasSubmenu) {
      const wrap=document.createElement('div'); wrap.className='toolbar-shapes-container'
      const btn=document.createElement('button'); btn.className='toolbar-btn'; btn.dataset.tool=t.tool; btn.title=t.label; btn.innerHTML=toolSvgs.rectangle
      btn.addEventListener('click',e=>{ e.stopPropagation(); const s=wrap.querySelector('.canvas-shape-submenu'); if(s)s.classList.toggle('visible'); setActiveTool(TOOLS.SHAPES) })
      wrap.appendChild(btn); toolBtnMap[t.tool]=btn
      const sts=[{key:'rectangle',label:'Rectangle',svg:toolSvgs.rectangle},{key:'circle',label:'Circle',svg:toolSvgs.circle2},{key:'triangle',label:'Triangle',svg:toolSvgs.triangle},{key:'diamond',label:'Diamond',svg:toolSvgs.diamond}]
      const submenu=document.createElement('div'); submenu.className='canvas-shape-submenu'
      for (const st of sts) { const o=document.createElement('button'); o.className='toolbar-submenu-item'; o.dataset.shapeType=st.key; o.title=st.label; o.innerHTML=st.svg; o.addEventListener('click',e=>{ e.stopPropagation(); setShapeSubType(st.key); setActiveTool(TOOLS.SHAPES); submenu.classList.remove('visible'); btn.innerHTML=st.svg }); submenu.appendChild(o) }
      wrap.appendChild(submenu); sideToolbar.appendChild(wrap)
    } else {
      const btn=document.createElement('button'); btn.className='toolbar-btn'; btn.dataset.tool=t.tool; btn.title=t.label; btn.innerHTML=t.svg; btn.addEventListener('click',()=>setActiveTool(t.tool)); sideToolbar.appendChild(btn); toolBtnMap[t.tool]=btn
    }
  }
  document.addEventListener('click',e=>{ const all=sideToolbar.querySelectorAll('.canvas-shape-submenu'); all.forEach(m=>{if(!m.parentElement.contains(e.target))m.classList.remove('visible')}) })
  return sideToolbar
}

function setActiveTool(tool) { _ui.activeTool=tool; _ui.canvasArea.style.cursor=tool===TOOLS.CURSOR?'default':'crosshair'; _ui.isDrawing=false; _ui.drawingPreview=null; _ui._tbDragIdx=undefined; _ui._tbDragOrig=undefined; _ui._shapeDragIdx=undefined; _ui._shapeDragOrig=undefined; updateToolUI() }
function setShapeSubType(type) { _ui.shapeSubType=type }
function updateToolUI() {
  if (!_ui||!_ui.sideToolbar) return
  const btns=_ui.sideToolbar.querySelectorAll('.toolbar-btn'); btns.forEach(b=>b.classList.toggle('active',b.dataset.tool===_ui.activeTool))
  const shapesBtn=_ui.sideToolbar.querySelector('.toolbar-btn[data-tool="'+TOOLS.SHAPES+'"]')
  if (shapesBtn) { const svgMap={rectangle:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>',circle:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="9"/></svg>',triangle:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2l10 20H2z"/></svg>',diamond:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2l10 10-10 10L2 12z"/></svg>'}; shapesBtn.innerHTML=svgMap[_ui.shapeSubType]||svgMap.rectangle }
}

/* ─── Events ─── */
let _listeners=[]
function wireEvents() {
  const area=_ui.canvasArea
  function addL(el,type,fn,opts) { el.addEventListener(type,fn,opts); _listeners.push({el,type,fn,opts}) }
  addL(area,'pointerdown',onPointerDown); addL(area,'pointermove',onPointerMove); addL(area,'pointerup',onPointerUp); addL(area,'pointerleave',onPointerUp)
  addL(area,'wheel',onWheel,{passive:false}); addL(area,'dblclick',onDoubleClick); addL(area,'contextmenu',onContextMenu)
  addL(document,'keydown',onKeyDown); addL(window,'resize',resizeCanvases)
  addL(area,'dragover',e=>e.preventDefault()); addL(area,'drop',onDrop)
}

function getEventWorld(e) { const r=_ui.canvasArea.getBoundingClientRect(); const sx=e.clientX-r.left, sy=e.clientY-r.top; return {sx,sy,wx:(sx-_ui.offsetX)/_ui.scale,wy:(sy-_ui.offsetY)/_ui.scale} }

function onPointerDown(e) {
  const {sx,sy,wx,wy}=getEventWorld(e); _ui.lastWorldMouse={x:wx,y:wy}; _ui.dragStartX=sx; _ui.dragStartY=sy
  if (e.button===2) { _ui.rmbDownTime=performance.now(); _ui.rmbMoved=false; _ui.rmbPending=true; _ui.lastPanX=sx; _ui.lastPanY=sy; return }
  if (e.button===0&&e.altKey) { _ui.isPanning=true; _ui.lastPanX=sx; _ui.lastPanY=sy; _ui.canvasArea.style.cursor='grabbing'; return }

  if (_ui.activeTool===TOOLS.SHAPES) {
    const defW=120, defH=80
    const shape={id:_ui.nextShapeId++,shapeType:_ui.shapeSubType||'rectangle',x:wx,y:wy,w:defW,h:defH,color:'#2b2b2b',borderColor:getAccentColor(),borderWidth:2,cornerRadius:4,image:null,locked:false}
    const idx=_canvasData.shapes.length
    _canvasData.shapes.push(shape)
    _parentTree.register('shape',shape.id,shape)
    clearSelection()
    _ui.selectedShapes.add(idx)
    _ui.drawingStartX=wx; _ui.drawingStartY=wy
    _ui._shapeDragIdx=idx
    _ui._shapeDragOrig={x:wx,y:wy,w:defW,h:defH}
    _ui.isDrawing=true
    _ui.canvasArea.setPointerCapture(e.pointerId)
    requestRender(); return
  }

  if (_ui.activeTool===TOOLS.IMAGE_CONTAINER) {
    const defW=280, defH=220
    const shape={id:_ui.nextShapeId++,shapeType:'rectangle',x:wx,y:wy,w:defW,h:defH,color:'#1e1e1e',borderColor:'#3a3a3a',borderWidth:1,cornerRadius:8,image:null,locked:false}
    const idx=_canvasData.shapes.length
    _canvasData.shapes.push(shape)
    _parentTree.register('shape',shape.id,shape)
    clearSelection()
    _ui.selectedShapes.add(idx)
    _ui.drawingStartX=wx; _ui.drawingStartY=wy
    _ui._shapeDragIdx=idx
    _ui._shapeDragOrig={x:wx,y:wy,w:defW,h:defH}
    _ui.isDrawing=true
    _ui.canvasArea.setPointerCapture(e.pointerId)
    requestRender(); return
  }

  if (_ui.activeTool===TOOLS.TEXT) {
    const tb={id:_ui.nextTextBoxId++,x:wx,y:wy,w:200,h:120,text:'',title:'',color:'#1a1a1a',borderColor:'#444',textColor:'#ddd',titleColor:'#e7e7e7',fontSize:14,locked:false}
    const idx=_canvasData.textBoxes.length
    _canvasData.textBoxes.push(tb)
    _parentTree.register('textBox',tb.id,tb)
    clearSelection()
    _ui.selectedTextBoxes.add(idx)
    _ui.drawingStartX=wx; _ui.drawingStartY=wy
    _ui._tbDragIdx=idx
    _ui._tbDragOrig={x:wx,y:wy,w:200,h:120}
    _ui.isDrawing=true
    _ui.canvasArea.setPointerCapture(e.pointerId)
    requestRender(); return
  }

  if (_ui.activeTool===TOOLS.ARROW) { const h=getTopHitAt(wx,wy); if(h&&(h.type==='textBox'||h.type==='shape')){_ui.connectingFrom=h;_ui.connectingMouseWorld={x:wx,y:wy}}else{_ui.drawingStartX=wx;_ui.drawingStartY=wy;_ui.isDrawing=true;_ui.canvasArea.setPointerCapture(e.pointerId)}; return }
  if (_ui.activeTool===TOOLS.CONNECTION_LINE) { const h=getTopHitAt(wx,wy); if(h&&h.type==='textBox'){_ui.connectingFrom={i:h.i,type:'textBox'};_ui.connectingMouseWorld={x:wx,y:wy}}else{_ui.drawingStartX=wx;_ui.drawingStartY=wy;_ui.isDrawing=true;_ui.canvasArea.setPointerCapture(e.pointerId)}; return }

  const edgeTb=getEdgeAt(wx,wy,_canvasData.textBoxes), edgeSh=edgeTb?null:getEdgeAt(wx,wy,_canvasData.shapes), edge=edgeTb||edgeSh
  if (edge) {
    _ui.isResizing=true; _ui.resizeHandle=edge.handle; _ui.resizeEntityType=edgeTb?'textBox':'shape'; _ui.resizeEntityIdx=edge.idx
    const entity=edgeTb?_canvasData.textBoxes[edge.idx]:_canvasData.shapes[edge.idx]; if(!entity){_ui.isResizing=false;return}
    _ui.resizeStartBounds={x:entity.x,y:entity.y,w:entity.w,h:entity.h}; _ui.canvasArea.style.cursor=edge.cursor; return
  }

  const hit=getTopHitAt(wx,wy)
  if (hit&&hit.type==='arrow') { const a=_canvasData.arrows[hit.i]; const ed=Math.min(Math.hypot(wx-a.x1,wy-a.y1),Math.hypot(wx-a.x2,wy-a.y2)); if(ed<12){ clearSelection(); _ui.selectedArrows.add(hit.i); updateSidePanel(); requestRender(); _ui.arrowDragTarget=hit.i; _ui.isDraggingArrowEnd=true; _ui.dragArrowEndSnapshot={...a}; return } }
  if (hit) {
    if (!e.shiftKey&&!e.ctrlKey) clearSelection()
    if (hit.type==='textBox') { if(e.ctrlKey){if(_ui.selectedTextBoxes.has(hit.i))_ui.selectedTextBoxes.delete(hit.i);else _ui.selectedTextBoxes.add(hit.i)}else{_ui.selectedTextBoxes.add(hit.i)}; _ui.isDragging=!_canvasData.textBoxes[hit.i].locked }
    else if (hit.type==='shape') { if(e.ctrlKey){if(_ui.selectedShapes.has(hit.i))_ui.selectedShapes.delete(hit.i);else _ui.selectedShapes.add(hit.i)}else{_ui.selectedShapes.add(hit.i)}; _ui.isDragging=!_canvasData.shapes[hit.i].locked }
    else if (hit.type==='arrow') { _ui.selectedArrows.add(hit.i); _ui.isDragging=!_canvasData.arrows[hit.i].locked }
    else if (hit.type==='connector') _ui.selectedConnectors.add(hit.i)
    else if (hit.type==='connection') _ui.selectedConnection=hit.i
    if (_ui.isDragging) {
      _ui._dragState=[]
      for (const idx of _ui.selectedTextBoxes) _ui._dragState.push({t:'tb',i:idx,sx:_canvasData.textBoxes[idx].x,sy:_canvasData.textBoxes[idx].y})
      for (const idx of _ui.selectedShapes) _ui._dragState.push({t:'sh',i:idx,sx:_canvasData.shapes[idx].x,sy:_canvasData.shapes[idx].y})
      for (const idx of _ui.selectedArrows) { const a=_canvasData.arrows[idx]; _ui._dragState.push({t:'ar',i:idx,sx1:a.x1,sy1:a.y1,sx2:a.x2,sy2:a.y2}) }
    }
    updateSidePanel(); requestRender(); return
  }

  if (e.button===0) { _ui.isSelectingBox=true; _ui.boxStartX=wx; _ui.boxStartY=wy; _ui.boxEndX=wx; _ui.boxEndY=wy; clearSelection() }
}

function onPointerMove(e) {
  const {sx,sy,wx,wy}=getEventWorld(e); _ui.lastWorldMouse={x:wx,y:wy}
  if (_ui.rmbPending&&(Math.abs(sx-_ui.dragStartX)>3||Math.abs(sy-_ui.dragStartY)>3)) { _ui.rmbMoved=true; _ui.isPanning=true; _ui.rmbPending=false; _ui.lastPanX=sx; _ui.lastPanY=sy; _ui.canvasArea.style.cursor='grabbing' }
  if (_ui.isPanning) { const dx=sx-_ui.lastPanX, dy=sy-_ui.lastPanY; _ui.offsetX+=dx; _ui.offsetY+=dy; _ui.targetOffsetX+=dx; _ui.targetOffsetY+=dy; _ui.lastPanX=sx; _ui.lastPanY=sy; requestRender(); return }
  if (_ui.isResizing) { const dx=(sx-_ui.dragStartX)/_ui.scale, dy=(sy-_ui.dragStartY)/_ui.scale, b=_ui.resizeStartBounds; if(!b)return; const h=_ui.resizeHandle; let nx=b.x,ny=b.y,nw=b.w,nh=b.h; if(h.includes('l')){nx=b.x+dx;nw=b.w-dx} if(h.includes('r'))nw=b.w+dx; if(h.includes('t')){ny=b.y+dy;nh=b.h-dy} if(h.includes('b'))nh=b.h+dy; if(nw<20){if(h.includes('l'))nx=b.x+b.w-20;nw=20} if(nh<20){if(h.includes('t'))ny=b.y+b.h-20;nh=20}; const entity=_ui.resizeEntityType==='textBox'?_canvasData.textBoxes[_ui.resizeEntityIdx]:_canvasData.shapes[_ui.resizeEntityIdx]; if(entity){entity.x=nx;entity.y=ny;entity.w=nw;entity.h=nh}; requestRender(); return }
  if (_ui.isDragging) { const dx=(sx-_ui.dragStartX)/_ui.scale, dy=(sy-_ui.dragStartY)/_ui.scale; for(const item of _ui._dragState){ if(item.t==='ar'){const a=_canvasData.arrows[item.i];if(a){a.x1=item.sx1+dx;a.y1=item.sy1+dy;a.x2=item.sx2+dx;a.y2=item.sy2+dy}}else{const e=item.t==='tb'?_canvasData.textBoxes[item.i]:_canvasData.shapes[item.i];if(e){e.x=item.sx+dx;e.y=item.sy+dy}} }; requestRender(); return }
  if (_ui.isDraggingArrowEnd&&_ui.arrowDragTarget!==null) { const a=_canvasData.arrows[_ui.arrowDragTarget]; if(a){ const snap=_ui.dragArrowEndSnapshot, fd=Math.hypot(wx-snap.x1,wy-snap.y1), td=Math.hypot(wx-snap.x2,wy-snap.y2); if(fd<td){a.x1=wx;a.y1=wy}else{a.x2=wx;a.y2=wy} }; requestRender(); return }
  if (_ui.connectingFrom!==null&&(_ui.activeTool===TOOLS.ARROW||_ui.activeTool===TOOLS.CONNECTION_LINE)) { _ui.connectingMouseWorld={x:wx,y:wy}; requestRender(); return }
  if (_ui.isDrawing) {
    if (_ui.activeTool===TOOLS.ARROW||_ui.activeTool===TOOLS.CONNECTION_LINE) { requestRender(); return }
    if (_ui.activeTool===TOOLS.TEXT&&_ui._tbDragIdx!==undefined) {
      const tb=_canvasData.textBoxes[_ui._tbDragIdx]
      if (tb) {
        const x=Math.min(_ui.drawingStartX,wx), y=Math.min(_ui.drawingStartY,wy)
        const w=Math.abs(wx-_ui.drawingStartX), h2=Math.abs(wy-_ui.drawingStartY)
        if (w>5||h2>5) { tb.x=x; tb.y=y; tb.w=Math.max(w,20); tb.h=Math.max(h2,20) }
      }
      requestRender(); return
    }
    if ((_ui.activeTool===TOOLS.SHAPES||_ui.activeTool===TOOLS.IMAGE_CONTAINER)&&_ui._shapeDragIdx!==undefined) {
      const shape=_canvasData.shapes[_ui._shapeDragIdx]
      if (shape) {
        const x=Math.min(_ui.drawingStartX,wx), y=Math.min(_ui.drawingStartY,wy)
        const w=Math.abs(wx-_ui.drawingStartX), h2=Math.abs(wy-_ui.drawingStartY)
        if (w>5||h2>5) { shape.x=x; shape.y=y; shape.w=Math.max(w,20); shape.h=Math.max(h2,20) }
      }
      requestRender(); return
    }
    const dx=Math.abs(wx-_ui.drawingStartX), dy=Math.abs(wy-_ui.drawingStartY)
    if (dx>2||dy>2) {
      const x=Math.min(_ui.drawingStartX,wx), y=Math.min(_ui.drawingStartY,wy), w=Math.abs(wx-_ui.drawingStartX), h2=Math.abs(wy-_ui.drawingStartY)
      _ui.drawingPreview={x,y,w,h2,shapeType:_ui.shapeSubType}
    } else _ui.drawingPreview=null
    requestRender(); return
  }
  if (_ui.isSelectingBox) { _ui.boxEndX=wx; _ui.boxEndY=wy; requestRender(); return }
  if (_ui.activeTool===TOOLS.CURSOR) { const edge=getEdgeAt(wx,wy,_canvasData.textBoxes)||getEdgeAt(wx,wy,_canvasData.shapes); _ui.canvasArea.style.cursor=edge?edge.cursor:'default' }
}

function onPointerUp(e) {
  const {wx,wy}=getEventWorld(e)
  if (_ui.isPanning) { _ui.isPanning=false; _ui.canvasArea.style.cursor=_ui.activeTool===TOOLS.CURSOR?'default':'crosshair'; saveData(); requestRender(); return }
  if (_ui.isResizing) { finishResize(); requestRender(); return }
  if (_ui.isDragging) { finishDrag(); requestRender(); return }
  if (_ui.isDraggingArrowEnd) { finishArrowDrag(); requestRender(); return }
  if (_ui.connectingFrom!==null) { const fromInfo=_ui.connectingFrom; const hit=getTopHitAt(wx,wy); if(hit&&(hit.type==='textBox'||hit.type==='shape')&&!(hit.type===fromInfo.type&&hit.i===fromInfo.i)){ if(_ui.activeTool===TOOLS.ARROW)addArrowBetween(fromInfo,hit); else if(_ui.activeTool===TOOLS.CONNECTION_LINE&&hit.type==='textBox'&&fromInfo.type==='textBox')addConnectionCmd(fromInfo.i,hit.i) }; _ui.connectingFrom=null; saveData(); requestRender(); return }
  if (_ui.isSelectingBox) { finishSelectBox(); requestRender(); return }
  if (_ui.isDrawing&&(_ui.activeTool===TOOLS.ARROW||_ui.activeTool===TOOLS.CONNECTION_LINE)) {
    const dx=wx-_ui.drawingStartX, dy=wy-_ui.drawingStartY
    if (Math.abs(dx)>5||Math.abs(dy)>5) {
      if (_ui.activeTool===TOOLS.ARROW) addArrowFromTo(_ui.drawingStartX,_ui.drawingStartY,wx,wy)
      else addConnectorFromTo(_ui.drawingStartX,_ui.drawingStartY,wx,wy)
    } else {
      if (_ui.activeTool===TOOLS.ARROW) addArrow(wx,wy)
      else addConnector(wx,wy)
    }
    _ui.isDrawing=false; saveData(); return
  }
  if (_ui.isDrawing&&_ui.activeTool===TOOLS.TEXT) {
    if (_ui._tbDragIdx!==undefined) {
      const tb=_canvasData.textBoxes[_ui._tbDragIdx]
      if (tb&&_ui._tbDragOrig) {
        const orig=_ui._tbDragOrig
        if (orig.x!==tb.x||orig.y!==tb.y||orig.w!==tb.w||orig.h!==tb.h) {
          const idx=_ui._tbDragIdx
          _history.push({undo(){const t=_canvasData.textBoxes[idx];if(t){t.x=orig.x;t.y=orig.y;t.w=orig.w;t.h=orig.h}},redo(){const t=_canvasData.textBoxes[idx];if(t){t.x=tb.x;t.y=tb.y;t.w=tb.w;t.h=tb.h}},description:'Add Text Box'})
        }
      }
    }
    _ui.isDrawing=false; _ui._tbDragIdx=undefined; _ui._tbDragOrig=undefined; saveData(); return
  }
  if (_ui.isDrawing&&(_ui.activeTool===TOOLS.SHAPES||_ui.activeTool===TOOLS.IMAGE_CONTAINER)&&_ui._shapeDragIdx!==undefined) {
    const shape=_canvasData.shapes[_ui._shapeDragIdx]
    if (shape&&_ui._shapeDragOrig) {
      const orig=_ui._shapeDragOrig
      if (orig.x!==shape.x||orig.y!==shape.y||orig.w!==shape.w||orig.h!==shape.h) {
        const idx=_ui._shapeDragIdx
        _history.push({undo(){const s=_canvasData.shapes[idx];if(s){s.x=orig.x;s.y=orig.y;s.w=orig.w;s.h=orig.h}},redo(){const s=_canvasData.shapes[idx];if(s){s.x=shape.x;s.y=shape.y;s.w=shape.w;s.h=shape.h}},description:'Add Shape'})
      }
    }
    _ui.isDrawing=false; _ui._shapeDragIdx=undefined; _ui._shapeDragOrig=undefined; saveData(); return
  }
}

function onWheel(e) {
  e.preventDefault()
  const rect=_ui.canvasArea.getBoundingClientRect(), sx=e.clientX-rect.left, sy=e.clientY-rect.top
  const factor=e.deltaY>0?0.92:1.08, newScale=clamp(_ui.targetScale*factor,0.05,5)
  const wx=(sx-_ui.offsetX)/_ui.scale, wy=(sy-_ui.offsetY)/_ui.scale
  _ui.targetOffsetX=sx-wx*newScale; _ui.targetOffsetY=sy-wy*newScale; _ui.targetScale=newScale; requestRender()
}

function onDoubleClick(e) {
  const {wx,wy}=getEventWorld(e)
  if (_ui.activeTool===TOOLS.TEXT) { addTextBox(wx,wy); return }
  const hit=getTopHitAt(wx,wy)
  if (hit&&hit.type==='textBox') { clearSelection(); _ui.selectedTextBoxes.add(hit.i); updateSidePanel(); return }
  if (hit&&hit.type==='connection') { _ui.selectedConnection=hit.i; updateSidePanel(); startConnectionEdit(hit.i); return }
}

function onContextMenu(e) {
  e.preventDefault()
  if (!_ui||!_ui.rmbPending) return
  const now=performance?performance.now():Date.now()
  if (now-_ui.rmbDownTime<=250&&!_ui.rmbMoved&&!_ui.isPanning) openContextMenu(e)
  _ui.rmbPending=false
}

function onDrop(e) {
  e.preventDefault(); const files=e.dataTransfer.files; if(!files||files.length===0) return
  const {wx,wy}=getEventWorld(e)
  for (const file of files) { if(!file.type.startsWith('image/'))continue; const reader=new FileReader(); reader.onload=()=>{ addShapeWithImage(wx,wy,reader.result); wx+=20; wy+=20 }; reader.readAsDataURL(file) }
}

function onKeyDown(e) {
  if (!_ui) return; if (document.activeElement?.tagName==='INPUT'||document.activeElement?.tagName==='TEXTAREA'||document.activeElement?.isContentEditable) return
  if (e.ctrlKey||e.metaKey) {
    if (e.key==='z'&&!e.shiftKey) { e.preventDefault(); performUndo(); return }
    if (e.key==='z'&&e.shiftKey) { e.preventDefault(); performRedo(); return }
    if (e.key==='y') { e.preventDefault(); performRedo(); return }
    if (e.key==='c') { e.preventDefault(); copySelection(); return }
    if (e.key==='v') { e.preventDefault(); pasteAt(); return }
    if (e.key==='d') { e.preventDefault(); duplicateSelection(); return }
    if (e.key==='s'&&e.shiftKey) { e.preventDefault(); if(window.__saveAs)window.__saveAs(); return }
    if (e.key==='s') { e.preventDefault(); if(window.__save)window.__save(); return }
    if (e.key===']') { e.preventDefault(); bringForward(); return }
    if (e.key==='[') { e.preventDefault(); sendBackward(); return }
    if (e.key==='}') { e.preventDefault(); bringToFront(); return }
    if (e.key==='{') { e.preventDefault(); sendToBack(); return }
    return
  }
  if (e.key==='Delete'||e.key==='Backspace') { e.preventDefault(); deleteSelected(); return }
  if (e.key==='Escape') { clearSelection(); _ui.connectingFrom=null; _ui.drawingPreview=null; closeContextMenu(); return }
  if (e.key==='f'||e.key==='F') { if (focusOnSelected()) return; focusOnAll(); return }
  if (e.key==='v'||e.key==='V') { setActiveTool(TOOLS.CURSOR); return }
  if (e.key==='t'||e.key==='T') { setActiveTool(TOOLS.TEXT); return }
  if (e.key==='a'||e.key==='A') { setActiveTool(TOOLS.ARROW); return }
  if (e.key==='c'||e.key==='C') { if(!e.ctrlKey&&!e.metaKey){setActiveTool(TOOLS.CONNECTION_LINE);return} }
  if (e.key==='l'||e.key==='L') { toggleLockSelected(); return }
  if (e.key.startsWith('Arrow')) {
    e.preventDefault(); const dx=e.key==='ArrowLeft'?-10:e.key==='ArrowRight'?10:0, dy=e.key==='ArrowUp'?-10:e.key==='ArrowDown'?10:0
    const moved=[], arrowMoves=[]
    for (const idx of _ui.selectedTextBoxes) { const tb=_canvasData.textBoxes[idx]; if(tb){moved.push({id:tb.id,fromX:tb.x,fromY:tb.y,toX:tb.x+dx,toY:tb.y+dy,type:'textBox'});tb.x+=dx;tb.y+=dy} }
    for (const idx of _ui.selectedShapes) { const s=_canvasData.shapes[idx]; if(s){moved.push({id:s.id,fromX:s.x,fromY:s.y,toX:s.x+dx,toY:s.y+dy,type:'shape'});s.x+=dx;s.y+=dy} }
    for (const idx of _ui.selectedArrows) { const a=_canvasData.arrows[idx]; if(a){arrowMoves.push({i:idx,from:{x1:a.x1,y1:a.y1,x2:a.x2,y2:a.y2},to:{x1:a.x1+dx,y1:a.y1+dy,x2:a.x2+dx,y2:a.y2+dy}});a.x1+=dx;a.y1+=dy;a.x2+=dx;a.y2+=dy} }
    if (moved.length>0) _history.push(createMoveCmd(moved))
    if (arrowMoves.length>0) {
      const snapshots=arrowMoves.map(m=>({...m}))
      _history.push({undo(){for(const s of snapshots){const a=_canvasData.arrows[s.i];if(a){a.x1=s.from.x1;a.y1=s.from.y1;a.x2=s.from.x2;a.y2=s.from.y2}}},redo(){for(const s of snapshots){const a=_canvasData.arrows[s.i];if(a){a.x1=s.to.x1;a.y1=s.to.y1;a.x2=s.to.x2;a.y2=s.to.y2}}},description:'Move Arrow'})
    }
    saveData(); requestRender()
  }
}

/* ─── Drag/Resize Helpers ─── */
function finishDrag() {
  _ui.isDragging=false; const moves=[], arrowMoves=[]
  for (const item of _ui._dragState) {
    if (item.t==='ar') {
      const a=_canvasData.arrows[item.i]
      if (a&&(item.sx1!==a.x1||item.sy1!==a.y1||item.sx2!==a.x2||item.sy2!==a.y2)) arrowMoves.push({i:item.i,from:{x1:item.sx1,y1:item.sy1,x2:item.sx2,y2:item.sy2},to:{x1:a.x1,y1:a.y1,x2:a.x2,y2:a.y2}})
    } else {
      const e=item.t==='tb'?_canvasData.textBoxes[item.i]:_canvasData.shapes[item.i]
      if (e&&(item.sx!==e.x||item.sy!==e.y)) moves.push({id:e.id,fromX:item.sx,fromY:item.sy,toX:e.x,toY:e.y,type:item.t==='tb'?'textBox':'shape'})
    }
  }
  if (moves.length>0) {
    _history.push(createMoveCmd(moves))
    const movedIds=new Set(moves.map(m=>m.id))
    for (const a of _canvasData.arrows) {
      if (a.connectedFrom!==null) {
        const arr=a.connectedFromType==='shape'?_canvasData.shapes:_canvasData.textBoxes
        const e=arr[a.connectedFrom]
        if (e&&movedIds.has(e.id)) { const p=getRectEdgePoint(e.x,e.y,e.w,e.h,a.x2,a.y2); a.x1=p.x;a.y1=p.y }
      }
      if (a.connectedTo!==null) {
        const arr=a.connectedToType==='shape'?_canvasData.shapes:_canvasData.textBoxes
        const e=arr[a.connectedTo]
        if (e&&movedIds.has(e.id)) { const p=getRectEdgePoint(e.x,e.y,e.w,e.h,a.x1,a.y1); a.x2=p.x;a.y2=p.y }
      }
    }
  }
  if (arrowMoves.length>0) {
    const snapshots=arrowMoves.map(m=>({i:m.i,...m}))
    _history.push({undo(){for(const s of snapshots){const a=_canvasData.arrows[s.i];if(a){a.x1=s.from.x1;a.y1=s.from.y1;a.x2=s.from.x2;a.y2=s.from.y2}}},redo(){for(const s of snapshots){const a=_canvasData.arrows[s.i];if(a){a.x1=s.to.x1;a.y1=s.to.y1;a.x2=s.to.x2;a.y2=s.to.y2}}},description:'Move Arrow'})
  }
  _ui._dragState=[]; saveData()
}
function finishResize() {
  _ui.isResizing=false; const entity=_ui.resizeEntityType==='textBox'?_canvasData.textBoxes[_ui.resizeEntityIdx]:_canvasData.shapes[_ui.resizeEntityIdx]
  if (entity&&_ui.resizeStartBounds) { const fb=_ui.resizeStartBounds, tb={x:entity.x,y:entity.y,w:entity.w,h:entity.h}; _history.push({undo(){const e=_ui.resizeEntityType==='textBox'?_canvasData.textBoxes[_ui.resizeEntityIdx]:_canvasData.shapes[_ui.resizeEntityIdx];if(e){e.x=fb.x;e.y=fb.y;e.w=fb.w;e.h=fb.h}},redo(){const e=_ui.resizeEntityType==='textBox'?_canvasData.textBoxes[_ui.resizeEntityIdx]:_canvasData.shapes[_ui.resizeEntityIdx];if(e){e.x=tb.x;e.y=tb.y;e.w=tb.w;e.h=tb.h}},description:'Resize'}) }
  for (const a of _canvasData.arrows) {
    if (a.connectedFrom!==null&&a.connectedFrom===_ui.resizeEntityIdx&&a.connectedFromType===_ui.resizeEntityType) { const arr=a.connectedFromType==='shape'?_canvasData.shapes:_canvasData.textBoxes; const e=arr[a.connectedFrom]; if(e){const p=getRectEdgePoint(e.x,e.y,e.w,e.h,a.x2,a.y2);a.x1=p.x;a.y1=p.y} }
    if (a.connectedTo!==null&&a.connectedTo===_ui.resizeEntityIdx&&a.connectedToType===_ui.resizeEntityType) { const arr=a.connectedToType==='shape'?_canvasData.shapes:_canvasData.textBoxes; const e=arr[a.connectedTo]; if(e){const p=getRectEdgePoint(e.x,e.y,e.w,e.h,a.x1,a.y1);a.x2=p.x;a.y2=p.y} }
  }
  _ui.resizeStartBounds=null; _ui.resizeEntityType=null; _ui.resizeEntityIdx=-1; saveData()
}
function finishArrowDrag() {
  _ui.isDraggingArrowEnd=false; const a=_canvasData.arrows[_ui.arrowDragTarget]
  if (a&&_ui.dragArrowEndSnapshot) { const snap=_ui.dragArrowEndSnapshot, cur={...a}; _history.push({undo(){const arrow=_canvasData.arrows[_ui.arrowDragTarget];if(arrow)Object.assign(arrow,snap)},redo(){const arrow=_canvasData.arrows[_ui.arrowDragTarget];if(arrow)Object.assign(arrow,cur)},description:'Move Arrow End'}) }
  _ui.arrowDragTarget=null; _ui.dragArrowEndSnapshot=null; saveData()
}
function finishSelectBox() {
  _ui.isSelectingBox=false; const x=Math.min(_ui.boxStartX,_ui.boxEndX), y=Math.min(_ui.boxStartY,_ui.boxEndY), w=Math.abs(_ui.boxEndX-_ui.boxStartX), h2=Math.abs(_ui.boxEndY-_ui.boxStartY)
  if (w>2||h2>2) { for(let i=0;i<_canvasData.textBoxes.length;i++){const tb=_canvasData.textBoxes[i];if(!tb.locked&&tb.x+tb.w>=x&&tb.x<=x+w&&tb.y+tb.h>=y&&tb.y<=y+h2)_ui.selectedTextBoxes.add(i)}; for(let i=0;i<_canvasData.shapes.length;i++){const s=_canvasData.shapes[i];if(!s.locked&&s.x+s.w>=x&&s.x<=x+w&&s.y+s.h>=y&&s.y<=y+h2)_ui.selectedShapes.add(i)}; updateSidePanel() }
}

/* ─── Context Menu ─── */
function openContextMenu(e) {
  const {wx,wy}=getEventWorld(e)
  const hit=getTopHitAt(wx,wy)
  if (hit) {
    if (hit.type==='textBox') { if(!_ui.selectedTextBoxes.has(hit.i)){clearSelection();_ui.selectedTextBoxes.add(hit.i)} }
    else if (hit.type==='shape') { if(!_ui.selectedShapes.has(hit.i)){clearSelection();_ui.selectedShapes.add(hit.i)} }
    else if (hit.type==='arrow') { if(!_ui.selectedArrows.has(hit.i)){clearSelection();_ui.selectedArrows.add(hit.i)} }
    else if (hit.type==='connector') { if(!_ui.selectedConnectors.has(hit.i)){clearSelection();_ui.selectedConnectors.add(hit.i)} }
    else if (hit.type==='connection') { clearSelection(); _ui.selectedConnection=hit.i }
  }
  updateSidePanel()

  const menu=_ui.contextMenu; menu.innerHTML=''; const items=[]
  items.push(buildAddSubmenu(wx,wy,hit))

  if (hit&&hit.type==='textBox') {
    items.push(makeCtxItem('Duplicate',()=>duplicateSelection(),'Ctrl+D'))
    items.push(makeCtxItem('Copy',()=>copySelection(),'Ctrl+C'))
    if (_ui.clipboard.length>0) items.push(makeCtxItem('Paste',()=>pasteAt(),'Ctrl+V'))
    items.push(makeCtxItem('Connect to...',()=>{_ui.connectingFrom={i:hit.i,type:'textBox'};_ui.activeTool=TOOLS.CONNECTION_LINE;updateToolUI()}))
    items.push(makeCtxItem(_canvasData.textBoxes[hit.i].locked?'Unlock':'Lock',()=>toggleLock('textBox',hit.i)))
    items.push(buildSortSubmenu())
    items.push(makeCtxItem('Delete',()=>deleteSelected(),null,true))
  } else if (hit&&hit.type==='shape') {
    items.push(makeCtxItem('Duplicate',()=>duplicateSelection(),'Ctrl+D'))
    items.push(makeCtxItem('Copy',()=>copySelection(),'Ctrl+C'))
    if (_ui.clipboard.length>0) items.push(makeCtxItem('Paste',()=>pasteAt(),'Ctrl+V'))
    items.push(makeCtxItem('Connect Arrow...',()=>{_ui.connectingFrom={i:hit.i,type:'shape'};_ui.activeTool=TOOLS.ARROW;updateToolUI()}))
    items.push(makeCtxItem(_canvasData.shapes[hit.i].locked?'Unlock':'Lock',()=>toggleLock('shape',hit.i)))
    items.push(buildSortSubmenu())
    items.push(makeCtxItem('Delete',()=>deleteSelected(),null,true))
  } else if (hit&&hit.type==='arrow') {
    items.push(makeCtxItem('Lock',()=>toggleLock('arrow',hit.i)))
    items.push(makeCtxItem('Delete Arrow',()=>deleteSelected(),null,true))
  } else if (hit&&hit.type==='connector') {
    items.push(makeCtxItem('Lock',()=>toggleLock('connector',hit.i)))
    items.push(makeCtxItem('Delete Connector',()=>deleteSelected(),null,true))
  } else if (hit&&hit.type==='connection') {
    items.push(makeCtxItem('Delete Connection',()=>deleteSelected(),null,true))
  } else {
    if (_ui.clipboard.length>0) items.push(makeCtxItem('Paste',()=>pasteAt(),'Ctrl+V'))
  }

  for (const it of items) { if (it) menu.appendChild(it) }
  menu.style.left=e.clientX+'px'; menu.style.top=e.clientY+'px'; menu.style.display='block'
  if (menu._closeTimer) { clearTimeout(menu._closeTimer); menu._closeTimer=null }
  if (menu._onDocHover) { document.removeEventListener('mouseover',menu._onDocHover) }
  menu._onDocHover=function(e){
    if(!menu.parentNode){document.removeEventListener('mouseover',menu._onDocHover);return}
    var el=document.elementFromPoint(e.clientX,e.clientY)
    var inside=el&&menu.contains(el)
    if(inside){if(menu._closeTimer){clearTimeout(menu._closeTimer);menu._closeTimer=null}}
    else if(!menu._closeTimer){menu._closeTimer=setTimeout(function(){closeContextMenu();menu._closeTimer=null},500)}
  }
  document.addEventListener('mouseover',menu._onDocHover)
  setTimeout(()=>{ document.addEventListener('pointerdown',e=>{if(!menu.contains(e.target))closeContextMenu()},{once:true}) },0)
}
function buildAddSubmenu(wx,wy,hit) {
  const wrap=document.createElement('div'); wrap.className='context-submenu-trigger'
  const btn=document.createElement('button'); btn.className='context-item has-submenu'; btn.innerHTML='<span>Add</span><span class="submenu-arrow">\u25b8</span>'
  const sub=document.createElement('div'); sub.className='context-submenu'
  sub.appendChild(makeCtxItem('Text Box',()=>addTextBox(wx,wy)))
  sub.appendChild(makeCtxItem('Arrow',()=>hit&&(hit.type==='textBox'||hit.type==='shape')?(_ui.connectingFrom=hit):addArrow(wx,wy)))
  sub.appendChild(makeCtxItem('Connector',()=>{if(hit&&hit.type==='textBox'){_ui.connectingFrom={i:hit.i,type:'textBox'};_ui.activeTool=TOOLS.CONNECTION_LINE;updateToolUI()}else addConnector(wx,wy)}))
  const shapeSub=document.createElement('div'); shapeSub.className='context-submenu-trigger'; shapeSub.innerHTML='<button class="context-item has-submenu"><span>Shapes</span><span class="submenu-arrow">\u25b8</span></button>'
  const shapeItems=document.createElement('div'); shapeItems.className='context-submenu'
  shapeItems.appendChild(makeCtxItem('Rectangle',()=>addShapeAtCenter(wx,wy,'rectangle')))
  shapeItems.appendChild(makeCtxItem('Circle',()=>addShapeAtCenter(wx,wy,'circle')))
  shapeItems.appendChild(makeCtxItem('Triangle',()=>addShapeAtCenter(wx,wy,'triangle')))
  shapeItems.appendChild(makeCtxItem('Diamond',()=>addShapeAtCenter(wx,wy,'diamond')))
  shapeSub.appendChild(shapeItems); sub.appendChild(shapeSub)
  sub.appendChild(makeCtxItem('Image Container',()=>addImageContainer(wx,wy)))
  wrap.appendChild(btn); wrap.appendChild(sub); return wrap
}
function buildSortSubmenu() {
  const wrap=document.createElement('div'); wrap.className='context-submenu-trigger'
  const btn=document.createElement('button'); btn.className='context-item has-submenu'; btn.innerHTML='<span>Sort</span><span class="submenu-arrow">\u25b8</span>'
  const sub=document.createElement('div'); sub.className='context-submenu'
  sub.appendChild(makeCtxItem('Bring to Front',()=>bringToFront(),'Ctrl+Shift+]'))
  sub.appendChild(makeCtxItem('Send to Back',()=>sendToBack(),'Ctrl+Shift+['))
  sub.appendChild(makeCtxItem('Bring Forward',()=>bringForward(),'Ctrl+]'))
  sub.appendChild(makeCtxItem('Send Backward',()=>sendBackward(),'Ctrl+['))
  wrap.appendChild(btn); wrap.appendChild(sub); return wrap
}
function makeCtxItem(label, onClick, shortcut, isDanger) {
  const el=document.createElement('button'); el.className='context-item'+(isDanger?' danger':'')
  if (shortcut) { el.innerHTML='<span>'+label+'</span><span class="ctx-shortcut">'+shortcut+'</span>' } else el.textContent=label
  el.addEventListener('click',()=>{onClick();closeContextMenu()}); return el
}
function closeContextMenu() {
  if (_ui&&_ui.contextMenu) {
    var m=_ui.contextMenu
    m.style.display='none'
    if (m._closeTimer) { clearTimeout(m._closeTimer); m._closeTimer=null }
    if (m._onDocHover) { document.removeEventListener('mouseover',m._onDocHover); m._onDocHover=null }
  }
}

/* ─── Persistent Text Box Overlays (continue) ─── */
function wireOverlayInput(tb, o) {
  const onInput=()=>{ tb.title=o.titleInput.value; tb.text=o.textArea.value }
  const onKey=e=>{ if(e.key==='Enter'&&!e.shiftKey&&e.target===o.titleInput){e.preventDefault();o.textArea.focus()} }
  o.titleInput.addEventListener('input',onInput); o.textArea.addEventListener('input',onInput)
  o.el.addEventListener('keydown',onKey)
}
function startConnectionEdit(idx) {
  const conn=_canvasData.connections[idx], origText=conn.text
  const midPt=worldToScreen((_canvasData.textBoxes[conn.from]?.x||0),_canvasData.textBoxes[conn.from]?.y||0)
  const el=document.createElement('input'); el.className='canvas-inline-editor-conn'; el.value=conn.text||''
  el.style.cssText='position:absolute;left:'+midPt.x+'px;top:'+midPt.y+'px;min-width:80px;transform:translate(-50%,-50%);z-index:100;background:rgba(0,0,0,0.85);color:#fff;border:1px solid #f0c800;border-radius:4px;padding:4px 8px;font-size:13px;font-weight:bold;text-align:center;outline:none;'
  _ui.entityLayer.appendChild(el); el.focus(); el.select()
  el.addEventListener('blur',()=>{ if(el.value!==origText){ conn.text=el.value; _history.push({undo(){conn.text=origText},redo(){conn.text=el.value},description:'Edit Connection Text'}) }; el.remove(); updateSidePanel() })
  el.addEventListener('keydown',e=>{ if(e.key==='Enter')el.blur(); if(e.key==='Escape'){conn.text=origText;el.blur();el.remove();updateSidePanel()} })
}

/* ─── Sort / Reorder ─── */
function bringToFront() {
  if (_ui.selectedTextBoxes.size === 0 && _ui.selectedShapes.size === 0) return
  const tbSnapshot = _canvasData.textBoxes.slice()
  const shSnapshot = _canvasData.shapes.slice()
  const tbSel = Array.from(_ui.selectedTextBoxes).sort((a, b) => a - b)
  const shSel = Array.from(_ui.selectedShapes).sort((a, b) => a - b)
  if (tbSel.length > 0) {
    const items = tbSel.map(i => _canvasData.textBoxes[i])
    for (let i = tbSel.length - 1; i >= 0; i--) _canvasData.textBoxes.splice(tbSel[i], 1)
    _canvasData.textBoxes.push(...items)
  }
  if (shSel.length > 0) {
    const items = shSel.map(i => _canvasData.shapes[i])
    for (let i = shSel.length - 1; i >= 0; i--) _canvasData.shapes.splice(shSel[i], 1)
    _canvasData.shapes.push(...items)
  }
  const selIds = new Set()
  for (const idx of tbSel) selIds.add('tb:' + tbSnapshot[idx].id)
  for (const idx of shSel) selIds.add('sh:' + shSnapshot[idx].id)
  _ui.selectedTextBoxes.clear(); _ui.selectedShapes.clear()
  for (let i = 0; i < _canvasData.textBoxes.length; i++) { if (selIds.has('tb:' + _canvasData.textBoxes[i].id)) _ui.selectedTextBoxes.add(i) }
  for (let i = 0; i < _canvasData.shapes.length; i++) { if (selIds.has('sh:' + _canvasData.shapes[i].id)) _ui.selectedShapes.add(i) }
  _history.push({
    undo() { _canvasData.textBoxes = tbSnapshot; _canvasData.shapes = shSnapshot; _ui.selectedTextBoxes = new Set(tbSel); _ui.selectedShapes = new Set(shSel); saveData(); updateSidePanel() },
    redo() {
      if (tbSel.length > 0) { const its = tbSel.map(i => _canvasData.textBoxes[i]); for (let i = tbSel.length - 1; i >= 0; i--) _canvasData.textBoxes.splice(tbSel[i], 1); _canvasData.textBoxes.push(...its) }
      if (shSel.length > 0) { const its = shSel.map(i => _canvasData.shapes[i]); for (let i = shSel.length - 1; i >= 0; i--) _canvasData.shapes.splice(shSel[i], 1); _canvasData.shapes.push(...its) }
      _ui.selectedTextBoxes.clear(); _ui.selectedShapes.clear()
      for (let i = 0; i < _canvasData.textBoxes.length; i++) { if (selIds.has('tb:' + _canvasData.textBoxes[i].id)) _ui.selectedTextBoxes.add(i) }
      for (let i = 0; i < _canvasData.shapes.length; i++) { if (selIds.has('sh:' + _canvasData.shapes[i].id)) _ui.selectedShapes.add(i) }
      saveData(); updateSidePanel()
    },
    description: 'Bring to Front'
  })
  saveData(); updateSidePanel()
}
function sendToBack() {
  if (_ui.selectedTextBoxes.size === 0 && _ui.selectedShapes.size === 0) return
  const tbSnapshot = _canvasData.textBoxes.slice()
  const shSnapshot = _canvasData.shapes.slice()
  const tbSel = Array.from(_ui.selectedTextBoxes).sort((a, b) => a - b)
  const shSel = Array.from(_ui.selectedShapes).sort((a, b) => a - b)
  if (tbSel.length > 0) {
    const items = tbSel.map(i => _canvasData.textBoxes[i])
    for (let i = tbSel.length - 1; i >= 0; i--) _canvasData.textBoxes.splice(tbSel[i], 1)
    _canvasData.textBoxes.unshift(...items)
  }
  if (shSel.length > 0) {
    const items = shSel.map(i => _canvasData.shapes[i])
    for (let i = shSel.length - 1; i >= 0; i--) _canvasData.shapes.splice(shSel[i], 1)
    _canvasData.shapes.unshift(...items)
  }
  const selIds = new Set()
  for (const idx of tbSel) selIds.add('tb:' + tbSnapshot[idx].id)
  for (const idx of shSel) selIds.add('sh:' + shSnapshot[idx].id)
  _ui.selectedTextBoxes.clear(); _ui.selectedShapes.clear()
  for (let i = 0; i < _canvasData.textBoxes.length; i++) { if (selIds.has('tb:' + _canvasData.textBoxes[i].id)) _ui.selectedTextBoxes.add(i) }
  for (let i = 0; i < _canvasData.shapes.length; i++) { if (selIds.has('sh:' + _canvasData.shapes[i].id)) _ui.selectedShapes.add(i) }
  _history.push({
    undo() { _canvasData.textBoxes = tbSnapshot; _canvasData.shapes = shSnapshot; _ui.selectedTextBoxes = new Set(tbSel); _ui.selectedShapes = new Set(shSel); saveData(); updateSidePanel() },
    redo() {
      if (tbSel.length > 0) { const its = tbSel.map(i => _canvasData.textBoxes[i]); for (let i = tbSel.length - 1; i >= 0; i--) _canvasData.textBoxes.splice(tbSel[i], 1); _canvasData.textBoxes.unshift(...its) }
      if (shSel.length > 0) { const its = shSel.map(i => _canvasData.shapes[i]); for (let i = shSel.length - 1; i >= 0; i--) _canvasData.shapes.splice(shSel[i], 1); _canvasData.shapes.unshift(...its) }
      _ui.selectedTextBoxes.clear(); _ui.selectedShapes.clear()
      for (let i = 0; i < _canvasData.textBoxes.length; i++) { if (selIds.has('tb:' + _canvasData.textBoxes[i].id)) _ui.selectedTextBoxes.add(i) }
      for (let i = 0; i < _canvasData.shapes.length; i++) { if (selIds.has('sh:' + _canvasData.shapes[i].id)) _ui.selectedShapes.add(i) }
      saveData(); updateSidePanel()
    },
    description: 'Send to Back'
  })
  saveData(); updateSidePanel()
}
function bringForward() {
  if (_ui.selectedTextBoxes.size === 0 && _ui.selectedShapes.size === 0) return
  const tbSnapshot = _canvasData.textBoxes.slice()
  const shSnapshot = _canvasData.shapes.slice()
  const tbSel = Array.from(_ui.selectedTextBoxes).sort((a, b) => b - a)
  const shSel = Array.from(_ui.selectedShapes).sort((a, b) => b - a)
  for (const idx of tbSel) {
    if (idx < _canvasData.textBoxes.length - 1) {
      [_canvasData.textBoxes[idx], _canvasData.textBoxes[idx + 1]] = [_canvasData.textBoxes[idx + 1], _canvasData.textBoxes[idx]]
      _ui.selectedTextBoxes.delete(idx); _ui.selectedTextBoxes.add(idx + 1)
    }
  }
  for (const idx of shSel) {
    if (idx < _canvasData.shapes.length - 1) {
      [_canvasData.shapes[idx], _canvasData.shapes[idx + 1]] = [_canvasData.shapes[idx + 1], _canvasData.shapes[idx]]
      _ui.selectedShapes.delete(idx); _ui.selectedShapes.add(idx + 1)
    }
  }
  _history.push({
    undo() { _canvasData.textBoxes = tbSnapshot; _canvasData.shapes = shSnapshot; _ui.selectedTextBoxes = new Set(tbSel); _ui.selectedShapes = new Set(shSel); saveData(); updateSidePanel() },
    redo() {
      const rTbSel = Array.from(tbSel).sort((a, b) => b - a)
      const rShSel = Array.from(shSel).sort((a, b) => b - a)
      for (const idx of rTbSel) { if (idx < _canvasData.textBoxes.length - 1) { [_canvasData.textBoxes[idx], _canvasData.textBoxes[idx + 1]] = [_canvasData.textBoxes[idx + 1], _canvasData.textBoxes[idx]]; _ui.selectedTextBoxes.delete(idx); _ui.selectedTextBoxes.add(idx + 1) } }
      for (const idx of rShSel) { if (idx < _canvasData.shapes.length - 1) { [_canvasData.shapes[idx], _canvasData.shapes[idx + 1]] = [_canvasData.shapes[idx + 1], _canvasData.shapes[idx]]; _ui.selectedShapes.delete(idx); _ui.selectedShapes.add(idx + 1) } }
      saveData(); updateSidePanel()
    },
    description: 'Bring Forward'
  })
  saveData(); updateSidePanel()
}
function sendBackward() {
  if (_ui.selectedTextBoxes.size === 0 && _ui.selectedShapes.size === 0) return
  const tbSnapshot = _canvasData.textBoxes.slice()
  const shSnapshot = _canvasData.shapes.slice()
  const tbSel = Array.from(_ui.selectedTextBoxes).sort((a, b) => a - b)
  const shSel = Array.from(_ui.selectedShapes).sort((a, b) => a - b)
  for (const idx of tbSel) {
    if (idx > 0) {
      [_canvasData.textBoxes[idx], _canvasData.textBoxes[idx - 1]] = [_canvasData.textBoxes[idx - 1], _canvasData.textBoxes[idx]]
      _ui.selectedTextBoxes.delete(idx); _ui.selectedTextBoxes.add(idx - 1)
    }
  }
  for (const idx of shSel) {
    if (idx > 0) {
      [_canvasData.shapes[idx], _canvasData.shapes[idx - 1]] = [_canvasData.shapes[idx - 1], _canvasData.shapes[idx]]
      _ui.selectedShapes.delete(idx); _ui.selectedShapes.add(idx - 1)
    }
  }
  _history.push({
    undo() { _canvasData.textBoxes = tbSnapshot; _canvasData.shapes = shSnapshot; _ui.selectedTextBoxes = new Set(tbSel); _ui.selectedShapes = new Set(shSel); saveData(); updateSidePanel() },
    redo() {
      const rTbSel = Array.from(_ui.selectedTextBoxes).sort((a, b) => a - b)
      const rShSel = Array.from(_ui.selectedShapes).sort((a, b) => a - b)
      for (const idx of rTbSel) { if (idx > 0) { [_canvasData.textBoxes[idx], _canvasData.textBoxes[idx - 1]] = [_canvasData.textBoxes[idx - 1], _canvasData.textBoxes[idx]]; _ui.selectedTextBoxes.delete(idx); _ui.selectedTextBoxes.add(idx - 1) } }
      for (const idx of rShSel) { if (idx > 0) { [_canvasData.shapes[idx], _canvasData.shapes[idx - 1]] = [_canvasData.shapes[idx - 1], _canvasData.shapes[idx]]; _ui.selectedShapes.delete(idx); _ui.selectedShapes.add(idx - 1) } }
      saveData(); updateSidePanel()
    },
    description: 'Send Backward'
  })
  saveData(); updateSidePanel()
}

/* ─── CRUD ─── */
function addTextBox(wx, wy, w, h) { w=w||200; h=h||120; const tb={id:_ui.nextTextBoxId++,x:wx,y:wy,w,h,text:'',title:'',color:'#1a1a1a',borderColor:'#444',textColor:'#ddd',titleColor:'#e7e7e7',fontSize:14,locked:false}; const idx=_canvasData.textBoxes.length; _canvasData.textBoxes.push(tb); _parentTree.register('textBox',tb.id,tb); clearSelection(); _ui.selectedTextBoxes.add(idx); _history.push({undo(){_canvasData.textBoxes.splice(idx,1);_parentTree.unregister('textBox',tb.id);clearSelection()},redo(){_canvasData.textBoxes.splice(idx,0,tb);_parentTree.register('textBox',tb.id,tb);clearSelection();_ui.selectedTextBoxes.add(idx)},description:'Add Text Box'}); updateSidePanel(); saveData() }
function addShapeAtCenter(wx, wy, shapeType, optW, optH) { const w=optW||120,h=optH||80; const shape={id:_ui.nextShapeId++,shapeType:shapeType||'rectangle',x:wx-w/2,y:wy-h/2,w,h,color:'#2b2b2b',borderColor:getAccentColor(),borderWidth:2,cornerRadius:4,image:null,locked:false}; const idx=_canvasData.shapes.length; _canvasData.shapes.push(shape); _parentTree.register('shape',shape.id,shape); clearSelection(); _ui.selectedShapes.add(idx); _history.push({undo(){_canvasData.shapes.splice(idx,1);_parentTree.unregister('shape',shape.id);clearSelection()},redo(){_canvasData.shapes.splice(idx,0,shape);_parentTree.register('shape',shape.id,shape);clearSelection();_ui.selectedShapes.add(idx)},description:'Add Shape'}); updateSidePanel(); saveData() }
function addImageContainer(wx, wy, optW, optH) { addShapeAtCenter(wx,wy,'rectangle',optW||280,optH||220); const s=_canvasData.shapes[_canvasData.shapes.length-1]; if(s){s.color='#1e1e1e';s.borderColor='#3a3a3a';s.borderWidth=1;s.cornerRadius=8} }
function addShapeWithImage(wx, wy, dataUrl) { addImageContainer(wx,wy); const s=_canvasData.shapes[_canvasData.shapes.length-1]; if(s) s.image=dataUrl }
function addArrow(wx, wy) { const off=60/_ui.scale; let x1=wx-off,y1=wy,x2=wx+off,y2=wy; let connectedFrom=null,connectedTo=null,connectedFromType=null,connectedToType=null; const startHit=getTopHitAt(x1,y1), endHit=getTopHitAt(x2,y2); if(startHit&&(startHit.type==='textBox'||startHit.type==='shape')){connectedFrom=startHit.i;connectedFromType=startHit.type;const arr=startHit.type==='shape'?_canvasData.shapes:_canvasData.textBoxes;const p=getRectEdgePoint(arr[startHit.i].x,arr[startHit.i].y,arr[startHit.i].w,arr[startHit.i].h,x2,y2);x1=p.x;y1=p.y} if(endHit&&(endHit.type==='textBox'||endHit.type==='shape')&&!(startHit&&startHit.type===endHit.type&&startHit.i===endHit.i)){connectedTo=endHit.i;connectedToType=endHit.type;const arr=endHit.type==='shape'?_canvasData.shapes:_canvasData.textBoxes;const p=getRectEdgePoint(arr[endHit.i].x,arr[endHit.i].y,arr[endHit.i].w,arr[endHit.i].h,x1,y1);x2=p.x;y2=p.y} const a={id:_ui.nextArrowId++,x1,y1,x2,y2,connectedFrom,connectedTo,connectedFromType,connectedToType,color:'#6bb5ff',lineWidth:2,headSize:14,locked:false}; const idx=_canvasData.arrows.length; _canvasData.arrows.push(a); clearSelection(); _ui.selectedArrows.add(idx); _history.push({undo(){_canvasData.arrows.splice(idx,1);clearSelection()},redo(){_canvasData.arrows.splice(idx,0,a);clearSelection();_ui.selectedArrows.add(idx)},description:'Add Arrow'}); saveData() }
function addArrowFromTo(x1, y1, x2, y2) { let connectedFrom=null,connectedTo=null,connectedFromType=null,connectedToType=null; const startHit=getTopHitAt(x1,y1), endHit=getTopHitAt(x2,y2); if(startHit&&(startHit.type==='textBox'||startHit.type==='shape')){connectedFrom=startHit.i;connectedFromType=startHit.type;const arr=startHit.type==='shape'?_canvasData.shapes:_canvasData.textBoxes;const p=getRectEdgePoint(arr[startHit.i].x,arr[startHit.i].y,arr[startHit.i].w,arr[startHit.i].h,x2,y2);x1=p.x;y1=p.y} if(endHit&&(endHit.type==='textBox'||endHit.type==='shape')&&!(startHit&&startHit.type===endHit.type&&startHit.i===endHit.i)){connectedTo=endHit.i;connectedToType=endHit.type;const arr=endHit.type==='shape'?_canvasData.shapes:_canvasData.textBoxes;const p=getRectEdgePoint(arr[endHit.i].x,arr[endHit.i].y,arr[endHit.i].w,arr[endHit.i].h,x1,y1);x2=p.x;y2=p.y} const a={id:_ui.nextArrowId++,x1,y1,x2,y2,connectedFrom,connectedTo,connectedFromType,connectedToType,color:'#6bb5ff',lineWidth:2,headSize:14,locked:false}; const idx=_canvasData.arrows.length; _canvasData.arrows.push(a); clearSelection(); _ui.selectedArrows.add(idx); _history.push({undo(){_canvasData.arrows.splice(idx,1);clearSelection()},redo(){_canvasData.arrows.splice(idx,0,a);clearSelection();_ui.selectedArrows.add(idx)},description:'Add Arrow'}); saveData() }
function addArrowBetween(fromHit, toHit) { const fromArr=fromHit.type==='shape'?_canvasData.shapes:_canvasData.textBoxes; const toArr=toHit.type==='shape'?_canvasData.shapes:_canvasData.textBoxes; const ft=fromArr[fromHit.i], tt=toArr[toHit.i]; if(!ft||!tt) return; const s=getRectEdgePoint(ft.x,ft.y,ft.w,ft.h,tt.x+tt.w/2,tt.y+tt.h/2), e2=getRectEdgePoint(tt.x,tt.y,tt.w,tt.h,ft.x+ft.w/2,ft.y+ft.h/2); const a={id:_ui.nextArrowId++,x1:s.x,y1:s.y,x2:e2.x,y2:e2.y,connectedFrom:fromHit.i,connectedTo:toHit.i,connectedFromType:fromHit.type,connectedToType:toHit.type,color:'#6bb5ff',lineWidth:2,headSize:14,locked:false}; const idx=_canvasData.arrows.length; _canvasData.arrows.push(a); _history.push({undo(){_canvasData.arrows.splice(idx,1)},redo(){_canvasData.arrows.splice(idx,0,a)},description:'Add Arrow'}); saveData() }
function addConnector(wx, wy) { const off=60/_ui.scale; const c={id:_ui.nextConnectorId++,x1:wx-off,y1:wy,x2:wx+off,y2:wy,connectedFrom:null,connectedTo:null,connectedFromType:null,connectedToType:null,color:'#6bb5ff',locked:false}; const idx=_canvasData.connectors.length; _canvasData.connectors.push(c); clearSelection(); _ui.selectedConnectors.add(idx); _history.push({undo(){_canvasData.connectors.splice(idx,1);clearSelection()},redo(){_canvasData.connectors.splice(idx,0,c);clearSelection();_ui.selectedConnectors.add(idx)},description:'Add Connector'}); saveData() }
function addConnectorFromTo(x1, y1, x2, y2) { const c={id:_ui.nextConnectorId++,x1,y1,x2,y2,connectedFrom:null,connectedTo:null,connectedFromType:null,connectedToType:null,color:'#6bb5ff',locked:false}; const idx=_canvasData.connectors.length; _canvasData.connectors.push(c); clearSelection(); _ui.selectedConnectors.add(idx); _history.push({undo(){_canvasData.connectors.splice(idx,1);clearSelection()},redo(){_canvasData.connectors.splice(idx,0,c);clearSelection();_ui.selectedConnectors.add(idx)},description:'Add Connector'}); saveData() }
function addConnectionCmd(fromIdx, toIdx) { const conn={id:_ui.nextConnectionId++,from:fromIdx,to:toIdx,color:'#6bb5ff',text:'',locked:false}; _canvasData.connections.push(conn); _history.push({undo(){const i=_canvasData.connections.findIndex(c=>c.id===conn.id);if(i!==-1)_canvasData.connections.splice(i,1)},redo(){_canvasData.connections.push(conn)},description:'Add Connection'}); saveData() }

function clearSelection() { _ui.selectedTextBoxes.clear(); _ui.selectedShapes.clear(); _ui.selectedArrows.clear(); _ui.selectedConnectors.clear(); _ui.selectedConnection=null; updateSidePanel(); requestRender() }
function deleteSelected() {
  const dt=[], ds=[], da=[], dc=[], dcn=[]
  for (const idx of _ui.selectedTextBoxes) dt.push({entity:_canvasData.textBoxes[idx],index:idx})
  for (const idx of _ui.selectedShapes) ds.push({entity:_canvasData.shapes[idx],index:idx})
  for (const idx of _ui.selectedArrows) da.push({entity:{..._canvasData.arrows[idx]},index:idx})
  for (const idx of _ui.selectedConnectors) dc.push({entity:{..._canvasData.connectors[idx]},index:idx})
  if (_ui.selectedConnection!==null) dcn.push({entity:{..._canvasData.connections[_ui.selectedConnection]},index:_ui.selectedConnection})
  for (let i=dt.length-1;i>=0;i--) { _parentTree.unregister('textBox',dt[i].entity.id); _canvasData.textBoxes.splice(dt[i].index,1) }
  for (let i=ds.length-1;i>=0;i--) { _parentTree.unregister('shape',ds[i].entity.id); _canvasData.shapes.splice(ds[i].index,1) }
  for (let i=da.length-1;i>=0;i--) _canvasData.arrows.splice(da[i].index,1)
  for (let i=dc.length-1;i>=0;i--) _canvasData.connectors.splice(dc[i].index,1)
  for (let i=dcn.length-1;i>=0;i--) _canvasData.connections.splice(dcn[i].index,1)
  const count=dt.length+ds.length+da.length+dc.length+dcn.length
  if (count>0) _history.push({undo(){for(const d of dt.reverse()){_canvasData.textBoxes.splice(d.index,0,d.entity);_parentTree.register('textBox',d.entity.id,d.entity)};for(const d of ds.reverse()){_canvasData.shapes.splice(d.index,0,d.entity);_parentTree.register('shape',d.entity.id,d.entity)};for(const d of da)_canvasData.arrows.splice(d.index,0,d.entity);for(const d of dc)_canvasData.connectors.splice(d.index,0,d.entity);for(const d of dcn)_canvasData.connections.splice(d.index,0,d.entity)},redo(){const allDel=[...dt,...ds].map(d=>d.entity.id);for(let i=_canvasData.textBoxes.length-1;i>=0;i--){if(allDel.includes(_canvasData.textBoxes[i].id)){_parentTree.unregister('textBox',_canvasData.textBoxes[i].id);_canvasData.textBoxes.splice(i,1)}};for(let i=_canvasData.shapes.length-1;i>=0;i--){if(allDel.includes(_canvasData.shapes[i].id)){_parentTree.unregister('shape',_canvasData.shapes[i].id);_canvasData.shapes.splice(i,1)}};for(const d of da){const ai=_canvasData.arrows.findIndex(a=>a.id===d.entity.id);if(ai!==-1)_canvasData.arrows.splice(ai,1)};for(const d of dc){const ci=_canvasData.connectors.findIndex(c=>c.id===d.entity.id);if(ci!==-1)_canvasData.connectors.splice(ci,1)};for(const d of dcn){const ci2=_canvasData.connections.findIndex(c=>c.id===d.entity.id);if(ci2!==-1)_canvasData.connections.splice(ci2,1)}},description:'Delete '+count+' item(s)'})
  clearSelection(); saveData()
}
function copySelection() { _ui.clipboard=[]; for(const idx of _ui.selectedTextBoxes){const tb=_canvasData.textBoxes[idx];_ui.clipboard.push({_type:'textBox',x:tb.x,y:tb.y,w:tb.w,h:tb.h,text:tb.text,title:tb.title,color:tb.color,borderColor:tb.borderColor,textColor:tb.textColor,titleColor:tb.titleColor,fontSize:tb.fontSize})}; for(const idx of _ui.selectedShapes){const s=_canvasData.shapes[idx];_ui.clipboard.push({_type:'shape',x:s.x,y:s.y,w:s.w,h:s.w===s.h?1:s.w/s.h,shapeType:s.shapeType,color:s.color,borderColor:s.borderColor,borderWidth:s.borderWidth,cornerRadius:s.cornerRadius,image:s.image})} }
function pasteAt() { if(_ui.clipboard.length===0) return; const off=20; const entries=[]; for(const item of _ui.clipboard){if(item._type==='textBox'){const tb={id:_ui.nextTextBoxId++,x:item.x+off,y:item.y+off,w:item.w,h:item.h,text:item.text,title:item.title,color:item.color,borderColor:item.borderColor,textColor:item.textColor,titleColor:item.titleColor,fontSize:item.fontSize,locked:false}; entries.push({entity:tb,type:'textBox',idx:_canvasData.textBoxes.length}); _canvasData.textBoxes.push(tb); _parentTree.register('textBox',tb.id,tb) }else if(item._type==='shape'){const s={id:_ui.nextShapeId++,x:item.x+off,y:item.y+off,w:item.w,h:item.h,shapeType:item.shapeType,color:item.color,borderColor:item.borderColor,borderWidth:item.borderWidth,cornerRadius:item.cornerRadius,image:item.image,locked:false}; entries.push({entity:s,type:'shape',idx:_canvasData.shapes.length}); _canvasData.shapes.push(s); _parentTree.register('shape',s.id,s) }}; if(entries.length>0){clearSelection(); for(const e of entries) {if(e.type==='textBox')_ui.selectedTextBoxes.add(e.idx);else _ui.selectedShapes.add(e.idx)}; _history.push({undo(){const ids=new Set(entries.map(e=>e.entity.id)); for(let i=_canvasData.textBoxes.length-1;i>=0;i--){if(ids.has(_canvasData.textBoxes[i].id)){_parentTree.unregister('textBox',_canvasData.textBoxes[i].id);_canvasData.textBoxes.splice(i,1)}}; for(let i=_canvasData.shapes.length-1;i>=0;i--){if(ids.has(_canvasData.shapes[i].id)){_parentTree.unregister('shape',_canvasData.shapes[i].id);_canvasData.shapes.splice(i,1)}}; clearSelection()},redo(){for(const e of entries){if(e.type==='textBox'){_canvasData.textBoxes.splice(e.idx,0,e.entity);_parentTree.register('textBox',e.entity.id,e.entity)}else{_canvasData.shapes.splice(e.idx,0,e.entity);_parentTree.register('shape',e.entity.id,e.entity)}}; clearSelection(); for(const e of entries){if(e.type==='textBox')_ui.selectedTextBoxes.add(e.idx);else _ui.selectedShapes.add(e.idx)}},description:'Paste '+entries.length+' item(s)'}); updateSidePanel(); saveData() } }
function duplicateSelection() { copySelection(); pasteAt() }

function createMoveCmd(moves) { return {undo(){for(const m of moves){const e=m.type==='textBox'?_canvasData.textBoxes.find(t=>t.id===m.id):_canvasData.shapes.find(s=>s.id===m.id);if(e){e.x=m.fromX;e.y=m.fromY}};if(moves.length>0){const first=moves[0];if(first.type==='textBox')_parentTree.markDirty('textBox',first.id);else _parentTree.markDirty('shape',first.id)}},redo(){for(const m of moves){const e=m.type==='textBox'?_canvasData.textBoxes.find(t=>t.id===m.id):_canvasData.shapes.find(s=>s.id===m.id);if(e){e.x=m.toX;e.y=m.toY}}},description:moves.length===1?'Move':'Move '+moves.length+' items'} }

function toggleLock(type, idx) {
  let entity, entities
  if (type==='textBox') { entity=_canvasData.textBoxes[idx]; entities=_canvasData.textBoxes }
  else if (type==='shape') { entity=_canvasData.shapes[idx]; entities=_canvasData.shapes }
  else if (type==='arrow') { entity=_canvasData.arrows[idx]; entities=_canvasData.arrows }
  else if (type==='connector') { entity=_canvasData.connectors[idx]; entities=_canvasData.connectors }
  else return
  if (!entity) return
  const wasLocked=entity.locked; entity.locked=!entity.locked
  _history.push({undo(){const e=entities[idx];if(e)e.locked=wasLocked;clearSelection()},redo(){const e=entities[idx];if(e)e.locked=!wasLocked;clearSelection()},description:entity.locked?'Lock':'Unlock'})
  clearSelection(); saveData()
}
function toggleLockSelected() { if(_ui.selectedTextBoxes.size===1) toggleLock('textBox',Array.from(_ui.selectedTextBoxes)[0]); else if(_ui.selectedShapes.size===1) toggleLock('shape',Array.from(_ui.selectedShapes)[0]); else if(_ui.selectedArrows.size===1) toggleLock('arrow',Array.from(_ui.selectedArrows)[0]); else if(_ui.selectedConnectors.size===1) toggleLock('connector',Array.from(_ui.selectedConnectors)[0]) }

function performUndo() { if(_history) _history.undo() }
function performRedo() { if(_history) _history.redo() }

/* ─── Focus ─── */
function focusOnAll() {
  if (!_ui) return
  const all=[..._canvasData.textBoxes,..._canvasData.shapes]; if(all.length===0){_ui.targetOffsetX=0;_ui.targetOffsetY=0;_ui.targetScale=1;return}
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity
  for(const e of all){minX=Math.min(minX,e.x);minY=Math.min(minY,e.y);maxX=Math.max(maxX,e.x+e.w);maxY=Math.max(maxY,e.y+e.h)}
  const pad=40,bw=maxX-minX+pad*2,bh=maxY-minY+pad*2,cw=_ui.canvasArea.clientWidth,ch=_ui.canvasArea.clientHeight
  const scale=Math.min(cw/bw,ch/bh,2), cx=(minX+maxX)/2, cy=(minY+maxY)/2
  _ui.targetOffsetX=cw/2-cx*scale; _ui.targetOffsetY=ch/2-cy*scale; _ui.targetScale=scale
}
function focusOnSelected() {
  if (!_ui) return false
  const sel=[]; for(const idx of _ui.selectedTextBoxes) sel.push(_canvasData.textBoxes[idx]); for(const idx of _ui.selectedShapes) sel.push(_canvasData.shapes[idx])
  if (sel.length===0) return false
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity
  for(const e of sel){if(!e)continue;minX=Math.min(minX,e.x);minY=Math.min(minY,e.y);maxX=Math.max(maxX,e.x+e.w);maxY=Math.max(maxY,e.y+e.h)}
  if(!isFinite(minX)) return false
  const pad=60,bw=maxX-minX+pad*2,bh=maxY-minY+pad*2,cw=_ui.canvasArea.clientWidth,ch=_ui.canvasArea.clientHeight
  const scale=Math.min(cw/bw,ch/bh,3), cx=(minX+maxX)/2, cy=(minY+maxY)/2
  _ui.targetOffsetX=cw/2-cx*scale; _ui.targetOffsetY=ch/2-cy*scale; _ui.targetScale=scale; return true
}

/* ─── Side Panel ─── */
function updateSidePanel() {
  const panel=_ui.sidePanel; if(!panel) return
  const count=_ui.selectedTextBoxes.size+_ui.selectedShapes.size+_ui.selectedArrows.size+_ui.selectedConnectors.size+(_ui.selectedConnection!==null?1:0)
  if (count===0) { panel.style.display='none'; return }
  panel.style.display='block'
  let html='<div class="canvas-panel-header">Selection</div>'
  if (_ui.selectedTextBoxes.size===1) { html+=buildTextBoxPanel(_canvasData.textBoxes[Array.from(_ui.selectedTextBoxes)[0]]) }
  else if (_ui.selectedShapes.size===1) { html+=buildShapePanel(_canvasData.shapes[Array.from(_ui.selectedShapes)[0]]) }
  else if (_ui.selectedArrows.size===1) { html+=buildArrowPanel(_canvasData.arrows[Array.from(_ui.selectedArrows)[0]]) }
  else if (_ui.selectedConnection!==null) { html+=buildConnectionPanel(_canvasData.connections[_ui.selectedConnection]) }

  html+='<div class="canvas-panel-info">'
  if (_ui.selectedTextBoxes.size>0) html+='<div>Text boxes: '+_ui.selectedTextBoxes.size+'</div>'
  if (_ui.selectedShapes.size>0) html+='<div>Shapes: '+_ui.selectedShapes.size+'</div>'
  if (_ui.selectedArrows.size>0) html+='<div>Arrows: '+_ui.selectedArrows.size+'</div>'
  if (_ui.selectedConnectors.size>0) html+='<div>Connectors: '+_ui.selectedConnectors.size+'</div>'
  html+='</div>'
  panel.innerHTML=html; wirePanelEvents()
}
function buildTextBoxPanel(tb) {
  return '<div class="canvas-panel-section">'+
    '<label>Background</label>'+colorSwatchHTML('cpColor',tb.color||'#1a1a1a')+
    '<label>Border</label>'+colorSwatchHTML('cpBorder',tb.borderColor||'#444')+
    '<label>Title Color</label>'+colorSwatchHTML('cpTitleColor',tb.titleColor||'#e7e7e7')+
    '<label>Text Color</label>'+colorSwatchHTML('cpTextColor',tb.textColor||'#ddd')+
    '<label>Title</label><input class="canvas-panel-input" id="pTitle" value="'+escAttr(tb.title||'')+'">'+
    '<label>Font Size</label><input class="canvas-panel-input" type="number" id="pFontSize" value="'+(tb.fontSize||14)+'" min="8" max="48">'+
    '<div style="display:flex;gap:4px;margin-top:4px;">'+
    '<button class="canvas-panel-btn" id="pLock">'+(tb.locked?'\u{1F512} Unlock':'\u{1F513} Lock')+'</button>'+
    '</div>'+
    '<div class="canvas-panel-info">X:'+Math.round(tb.x)+' Y:'+Math.round(tb.y)+' W:'+Math.round(tb.w)+' H:'+Math.round(tb.h)+'</div>'+
    '</div>'
}
function buildShapePanel(s) {
  return '<div class="canvas-panel-section">'+
    '<label>Shape: '+s.shapeType+'</label>'+
    '<label>Fill</label>'+colorSwatchHTML('cpColor',s.color||'#2b2b2b')+
    '<label>Border</label>'+colorSwatchHTML('cpBorder',s.borderColor||getAccentColor())+
    '<label>Border Width</label><input class="canvas-panel-input" type="number" id="pBorderW" value="'+(s.borderWidth||2)+'" min="0" max="20">'+
    '<button class="canvas-panel-btn" id="pLock">'+(s.locked?'\u{1F512} Unlock':'\u{1F513} Lock')+'</button>'+
    '<div class="canvas-panel-info">X:'+Math.round(s.x)+' Y:'+Math.round(s.y)+' W:'+Math.round(s.w)+' H:'+Math.round(s.h)+'</div>'+
    '</div>'
}
function buildArrowPanel(a) {
  return '<div class="canvas-panel-section"><label>Arrow Color</label>'+colorSwatchHTML('cpColor',a.color||'#6bb5ff')+
    '<label>Thickness</label><input class="canvas-panel-input" type="number" id="pLineW" value="'+(a.lineWidth||2)+'" min="1" max="10">'+
    '<label>Head Size</label><input class="canvas-panel-input" type="number" id="pHeadSz" value="'+(a.headSize||14)+'" min="6" max="30">'+
    '<button class="canvas-panel-btn" id="pLock">'+(a.locked?'\u{1F512} Unlock':'\u{1F513} Lock')+'</button></div>'
}
function buildConnectionPanel(c) {
  return '<div class="canvas-panel-section"><label>Color</label>'+colorSwatchHTML('cpColor',c.color||'#6bb5ff')+
    '<label>Label</label><input class="canvas-panel-input" id="pConnText" value="'+escAttr(c.text||'')+'">'+
    '</div>'
}
function wirePanelEvents() {
  const panel=_ui.sidePanel
  panel.querySelectorAll('.panel-color-swatch').forEach(el=>{ initColorSwatch(el,{onSelect:hex=>{const prop=el.id==='cpColor'?'color':el.id==='cpBorder'?'borderColor':el.id==='cpTitleColor'?'titleColor':el.id==='cpTextColor'?'textColor':'color';let e;if(_ui.selectedTextBoxes.size===1)e=_canvasData.textBoxes[Array.from(_ui.selectedTextBoxes)[0]];else if(_ui.selectedShapes.size===1)e=_canvasData.shapes[Array.from(_ui.selectedShapes)[0]];else if(_ui.selectedArrows.size===1)e=_canvasData.arrows[Array.from(_ui.selectedArrows)[0]];else if(_ui.selectedConnection!==null)e=_canvasData.connections[_ui.selectedConnection];if(!e)return;const ov=e[prop];e[prop]=hex;_history.push({undo(){e[prop]=ov},redo(){e[prop]=hex},description:'Change Color'});saveData()}}) })
  panel.querySelectorAll('.canvas-panel-input').forEach(el=>{ el.addEventListener('change',()=>{const id2=el.id;let e;if(id2==='pTitle'||id2==='pFontSize'){if(_ui.selectedTextBoxes.size===1)e=_canvasData.textBoxes[Array.from(_ui.selectedTextBoxes)[0]]}else if(id2==='pBorderW'){if(_ui.selectedShapes.size===1)e=_canvasData.shapes[Array.from(_ui.selectedShapes)[0]]}else if(id2==='pLineW'||id2==='pHeadSz'){if(_ui.selectedArrows.size===1)e=_canvasData.arrows[Array.from(_ui.selectedArrows)[0]]}else if(id2==='pConnText'){if(_ui.selectedConnection!==null)e=_canvasData.connections[_ui.selectedConnection]};if(!e)return;const prop=id2==='pTitle'?'title':id2==='pFontSize'?'fontSize':id2==='pBorderW'?'borderWidth':id2==='pLineW'?'lineWidth':id2==='pHeadSz'?'headSize':id2==='pConnText'?'text':'color';const oldVal=e[prop],newVal=el.type==='number'?parseInt(el.value)||0:el.value;e[prop]=newVal;_history.push({undo(){e[prop]=oldVal},redo(){e[prop]=newVal},description:'Change '+prop});saveData()}) })
  const lockBtn=document.getElementById('pLock'); if(lockBtn) lockBtn.addEventListener('click',()=>{if(_ui.selectedTextBoxes.size===1)toggleLock('textBox',Array.from(_ui.selectedTextBoxes)[0]);else if(_ui.selectedShapes.size===1)toggleLock('shape',Array.from(_ui.selectedShapes)[0]);else if(_ui.selectedArrows.size===1)toggleLock('arrow',Array.from(_ui.selectedArrows)[0]);else if(_ui.selectedConnectors.size===1)toggleLock('connector',Array.from(_ui.selectedConnectors)[0])})
}

/* ─── Animation & Resize ─── */
function requestRender() {
  _renderDirty = true
  if (!_animationId) _animationId = requestAnimationFrame(animate)
}

function resizeCanvases() {
  if (!_ui||!_ui.canvasArea) return
  const dpr=window.devicePixelRatio||1, rect=_ui.canvasArea.getBoundingClientRect(), w=rect.width, h=rect.height
  if (w === _lastCanvasW && h === _lastCanvasH) return
  _lastCanvasW = w; _lastCanvasH = h
  _ui.mainCanvas.style.width=w+'px'; _ui.mainCanvas.style.height=h+'px'; _ui.mainCanvas.width=w*dpr; _ui.mainCanvas.height=h*dpr
  _ui.arrowCanvas.style.width=w+'px'; _ui.arrowCanvas.style.height=h+'px'; _ui.arrowCanvas.width=w*dpr; _ui.arrowCanvas.height=h*dpr
}
function animate() {
  if(!_ui) { _animationId=null; return }
  const settled=Math.abs(_ui.offsetX-_ui.targetOffsetX)<0.5&&Math.abs(_ui.offsetY-_ui.targetOffsetY)<0.5&&Math.abs(_ui.scale-_ui.targetScale)<0.0005
  if (settled&&!_renderDirty) {
    _ui.offsetX=_ui.targetOffsetX; _ui.offsetY=_ui.targetOffsetY; _ui.scale=_ui.targetScale
    _animationId=null; return
  }
  _renderDirty=false
  _ui.offsetX+=(_ui.targetOffsetX-_ui.offsetX)*0.3; _ui.offsetY+=(_ui.targetOffsetY-_ui.offsetY)*0.3; _ui.scale+=(_ui.targetScale-_ui.scale)*0.3
  _parentTree.recomputeDirty()
  resizeCanvases(); drawEntities(); drawArrowsAndConnectors(); updateTextBoxOverlays()
  _animationId=requestAnimationFrame(animate)
}
function saveData() { if(!_currentCanvasId||!_canvasData) return; _canvasData.viewport={offsetX:_ui.targetOffsetX,offsetY:_ui.targetOffsetY,scale:_ui.targetScale}; _canvasData.nextTextBoxId=_ui.nextTextBoxId; _canvasData.nextShapeId=_ui.nextShapeId; _canvasData.nextArrowId=_ui.nextArrowId; _canvasData.nextConnectorId=_ui.nextConnectorId; _canvasData.nextConnectionId=_ui.nextConnectionId; markDirty(); requestRender() }

/* ─── Destroy ─── */
export function destroyCanvas() {
  if (_animationId) { cancelAnimationFrame(_animationId); _animationId=null }
  for (const l of _listeners) { l.el.removeEventListener(l.type,l.fn,l.opts) }; _listeners=[]
  const area=document.getElementById('boardArea')
  if (area) { area.style.padding=''; area.style.overflow=''; area.style.background=''; area.style.position='' }
  if (_ui&&_ui._textBoxOverlays) { for (const [id] of _ui._textBoxOverlays) removeTextBoxOverlay(id); _ui._textBoxOverlays.clear() }
  _currentCanvasId=null; _canvasData=null; _ui=null; _ctx=null; _arrowCtx=null; _history=null; _renderedCanvasId=null; _parentTree=null
  _cachedGridRgb=null; _cachedThemeBg=null; _cachedAccent=null; _cachedPanelBg=null; _lastCanvasW=0; _lastCanvasH=0
}
