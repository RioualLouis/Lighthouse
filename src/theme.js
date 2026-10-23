// Diagram colors. Every item type (class, interface, actor, note, decision,
// container...) has its own color, defined once in config.toml and shared by
// all diagram types. Mermaid theme variables cover most items; the rest is
// painted by `decorate` after rendering (stereotyped classes, choice states)
// or by CSS injected through `themeCSS` (sequence actors, activity shapes).
'use strict';

(function () {
  /** Diagram family from the first keyword of the code. */
  const KINDS = {
    classDiagram: 'class', 'classDiagram-v2': 'class',
    sequenceDiagram: 'sequence',
    'usecase-beta': 'usecase',
    stateDiagram: 'state', 'stateDiagram-v2': 'state',
    flowchart: 'activity', graph: 'activity', 'swimlane-beta': 'activity',
  };

  function kindOf(keyword) {
    return KINDS[keyword] ?? 'other';
  }

  function baseVariables(cfg) {
    const d = cfg.diagram;
    const el = d.element;
    const box = d.container;
    return {
      background: cfg.preview.background,
      fontFamily: d.font_family,
      fontSize: `${d.font_size}px`,
      textColor: d.text,
      lineColor: d.line,
      primaryColor: el.fill,
      primaryBorderColor: el.border,
      primaryTextColor: el.text,
      secondaryColor: d.secondary,
      tertiaryColor: d.tertiary,
      mainBkg: el.fill,
      nodeBorder: el.border,
      nodeTextColor: el.text,
      classText: el.text,
      edgeLabelBackground: d.edge_label_background,
      relationColor: d.line,
      relationLabelColor: d.text,
      relationLabelBackground: d.edge_label_background,
      clusterBkg: box.fill,
      clusterBorder: box.border,
      titleColor: box.text,
      noteBkgColor: d.note.fill,
      noteBorderColor: d.note.border,
      noteTextColor: d.note.text,
      // Sequence
      actorBkg: el.fill,
      actorBorder: el.border,
      actorTextColor: el.text,
      actorLineColor: d.lifeline,
      signalColor: d.message,
      signalTextColor: d.message_text,
      activationBkgColor: d.activation.fill,
      activationBorderColor: d.activation.border,
      labelBoxBkgColor: box.header,
      labelBoxBorderColor: box.border,
      labelTextColor: box.text,
      loopTextColor: box.text,
      sequenceNumberColor: d.sequence_number,
      // State
      stateBkg: el.fill,
      stateBorder: el.border,
      stateLabelColor: el.text,
      labelBackgroundColor: d.edge_label_background,
      compositeBackground: box.fill,
      compositeTitleBackground: box.header,
      compositeBorder: box.border,
      altBackground: box.fill,
      specialStateColor: d.terminal,
      innerEndBackground: d.terminal,
      transitionColor: d.line,
      transitionLabelColor: d.text,
      // Use case
      usecaseBkg: el.fill,
      usecaseBorder: el.border,
      usecaseActorBkg: d.actor.fill,
      usecaseActorBorder: d.actor.border,
      usecaseBoundaryBkg: box.fill,
      usecaseBoundaryBorder: box.border,
      usecaseIncludeLine: d.include_line,
      usecaseExtendLine: d.extend_line,
    };
  }

  /** Variables and CSS that only make sense for one diagram family. */
  function kindSpecific(d, kind) {
    const important = (props) => Object.entries(props).map(([k, v]) => `${k}: ${v} !important;`).join(' ');
    switch (kind) {
      case 'sequence':
        return {
          vars: {},
          // Participants and stick-figure actors share Mermaid's actor variables.
          css: `
            .actor-man line, .actor-man circle, .actor-man path { ${important({ stroke: d.actor.border })} }
            .actor-man circle { ${important({ fill: d.actor.fill })} }
            .actor-man text, .actor-man text tspan { ${important({ fill: d.actor.text, stroke: 'none' })} }`,
        };
      case 'usecase':
        return {
          vars: { actorBkg: d.actor.fill, actorBorder: d.actor.border, actorTextColor: d.actor.text },
          // Mermaid leaves SVG use case labels left-aligned on the ellipse center.
          css: '.usecase-element .label text { text-anchor: middle; }',
        };
      case 'state':
        return {
          vars: {},
          // Composite states are outlined like states by Mermaid; end points
          // get their center filled with the state border color.
          css: `
            .statediagram-cluster rect { ${important({ stroke: d.container.border })} }
            .node .outer-path:not(.label-container) > path { ${important({ fill: '#FFFFFF', stroke: d.terminal, 'stroke-width': '1.5px' })} }
            .node .outer-path:not(.label-container) > g path { ${important({ fill: d.terminal, stroke: d.terminal })} }`,
        };
      case 'activity':
        return {
          vars: { stateBorder: d.terminal }, // inner dot of the end point
          // Flowchart CSS paints every shape like an action: restore the UML
          // look of start/end points, fork/join bars and decision diamonds.
          css: `
            .node .state-start { ${important({ fill: d.terminal, stroke: d.terminal })} }
            .node .outer-path:not(.label-container) > path { ${important({ fill: '#FFFFFF', stroke: d.terminal, 'stroke-width': '1.5px' })} }
            .node .outer-path:not(.label-container) > g path { ${important({ fill: d.terminal, stroke: d.terminal })} }
            .node > g:not([class]) > path { ${important({ fill: d.line, stroke: d.line })} }
            .node polygon.label-container { ${important({ fill: d.decision.fill, stroke: d.decision.border })} }
            .node:has(> polygon.label-container) text, .node:has(> polygon.label-container) tspan { ${important({ fill: d.decision.text })} }`,
        };
      default:
        return { vars: {}, css: '' };
    }
  }

  function mermaidConfig(cfg, kind) {
    const d = cfg.diagram;
    const extra = kindSpecific(d, kind);
    return {
      startOnLoad: false,
      securityLevel: 'strict',
      suppressErrorRendering: true,
      theme: 'base',
      look: d.look,
      themeVariables: { ...baseVariables(cfg), ...extra.vars, ...d.overrides },
      themeCSS: extra.css,
      fontFamily: d.font_family,
      // SVG <text> labels instead of HTML: identical on screen and in PNG exports.
      htmlLabels: false,
      class: { useMaxWidth: false },
      sequence: { useMaxWidth: false },
      flowchart: { useMaxWidth: false },
      state: { useMaxWidth: false },
      usecase: { useMaxWidth: false, usecaseFontSize: d.font_size, actorFontSize: d.font_size - 1 },
      er: { useMaxWidth: false },
    };
  }

  // ------------------------------------------------------------ decorate

  /** Paints the shapes and texts of one rendered node with an item color. */
  function paint(node, item) {
    for (const shape of node.querySelectorAll('path, rect, polygon, ellipse, circle')) {
      if (shape.classList.contains('background') || shape.closest('.label')) continue;
      if (shape.getAttribute('fill') !== 'none') shape.style.setProperty('fill', item.fill, 'important');
      if (shape.getAttribute('stroke') !== 'none') shape.style.setProperty('stroke', item.border, 'important');
    }
    for (const text of node.querySelectorAll('text, tspan')) {
      text.style.setProperty('fill', item.text, 'important');
    }
  }

  const STEREOTYPES = { interface: 'interface', abstract: 'abstract', enumeration: 'enumeration', enum: 'enumeration' };

  function decorateClasses(svg, d) {
    for (const node of svg.querySelectorAll('g.node')) {
      const annotation = node.querySelector('.annotation-group')?.textContent ?? '';
      const m = /«\s*(interface|abstract|enumeration|enum)\s*»/i.exec(annotation);
      if (!m) continue;
      paint(node, d[STEREOTYPES[m[1].toLowerCase()]]);
    }
  }

  function decorateStates(svg, d, code) {
    const choices = new Set();
    for (const m of code.matchAll(/^\s*state\s+([^\s{]+)\s*<<\s*choice\s*>>/gim)) choices.add(m[1]);
    if (!choices.size) return;
    for (const node of svg.querySelectorAll('g.node[id]')) {
      const m = /-state-(.+)-\d+$/.exec(node.id);
      if (m && choices.has(m[1])) paint(node, d.decision);
    }
  }

  /**
   * Puts actor names below the stick figures. Mermaid centers them on a
   * baseline that WebKitGTK places over the legs.
   */
  function placeActorNames(svg) {
    for (const actor of svg.querySelectorAll('g.actor-man')) {
      const ys = [...actor.querySelectorAll('line')]
        .flatMap((l) => [Number(l.getAttribute('y1')), Number(l.getAttribute('y2'))])
        .filter(Number.isFinite);
      if (!ys.length) continue;
      const bottom = Math.max(...ys);
      for (const text of actor.querySelectorAll(':scope > text')) {
        const size = parseFloat(text.style.fontSize) || 16;
        text.setAttribute('y', String(bottom + size + 2));
        text.removeAttribute('dominant-baseline');
        text.removeAttribute('alignment-baseline');
      }
    }
  }

  /** Applies the item colors Mermaid cannot set through its theme. */
  function decorate(svg, kind, code, cfg) {
    if (kind === 'class') decorateClasses(svg, cfg.diagram);
    if (kind === 'state') decorateStates(svg, cfg.diagram, code);
    if (kind === 'sequence') placeActorNames(svg);
  }

  // -------------------------------------------------------------- legend

  /** Item types shown in the help legend of each diagram family. */
  const LEGEND = {
    class: [
      ['item', 'element', 'Class'], ['item', 'interface', 'Interface'], ['item', 'abstract', 'Abstract class'],
      ['item', 'enumeration', 'Enumeration'], ['item', 'note', 'Note'], ['box', 'container', 'Namespace'],
      ['line', 'line', 'Relations'],
    ],
    sequence: [
      ['item', 'element', 'Participant'], ['actor', 'actor', 'Actor'], ['item', 'activation', 'Activation'],
      ['item', 'note', 'Note'], ['box', 'container', 'Block (loop, alt, opt...)'], ['line', 'message', 'Messages'],
    ],
    usecase: [
      ['actor', 'actor', 'Actor'], ['ellipse', 'element', 'Use case'], ['box', 'container', 'System boundary'],
      ['item', 'note', 'Note'], ['line', 'include_line', 'Include'], ['line', 'extend_line', 'Extend'],
    ],
    state: [
      ['item', 'element', 'State'], ['box', 'container', 'Composite state'], ['diamond', 'decision', 'Choice'],
      ['dot', 'terminal', 'Start / end'], ['line', 'line', 'Transitions, fork / join'], ['item', 'note', 'Note'],
    ],
    activity: [
      ['item', 'element', 'Action'], ['diamond', 'decision', 'Decision'], ['dot', 'terminal', 'Start / end'],
      ['line', 'line', 'Flows, fork / join'], ['box', 'container', 'Partition (subgraph)'],
    ],
  };

  function legend(kind, cfg) {
    const d = cfg.diagram;
    return (LEGEND[kind] ?? []).map(([shape, key, label]) => {
      const value = d[key];
      return typeof value === 'string'
        ? { shape, label, fill: value, border: value }
        : { shape, label, fill: value.fill, border: value.border, header: value.header };
    });
  }

  window.LighthouseTheme = { kindOf, mermaidConfig, decorate, legend };
})();
