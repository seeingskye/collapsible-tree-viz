/**
 * Welcome to the Looker Custom Visualization Builder! Please refer to the following resources 
 * to help you write your visualization:
 *  - API Documentation - https://github.com/looker/custom_visualizations_v2/blob/master/docs/api_reference.md
 *  - Example Visualizations - https://github.com/looker/custom_visualizations_v2/tree/master/src/examples
 *  - How to use the CVB - https://developers.looker.com/marketplace/tutorials/about-custom-viz-builder
 **/
function addTextBox(foreignObjects, nodeWidths) {
  foreignObjects.each((d, i, nodes) => {
    
    const nodeWidth = nodeWidths[d.depth];
    const node = d3.select(nodes[i]);
    // Set initial max bounding width for foreignObject
    node.attr("width", nodeWidth);
    let div = node.append('xhtml:span')
    div.html(`${d.data.name}`);
    const {width: divWidth, height: divHeight} = div.node().getBoundingClientRect();
    // Set forignObject to new minimum width
    node.attr("width", divWidth);
    node.attr('x', (d) => {
        return d.children || d._children ? -divWidth -10 : 10
      })
      .attr('y', -divHeight / 2)
      .attr("height", divHeight);
  })
}
// recursively create children array
function descend(obj, depth = 0) {
    const arr = []
    for (const k in obj) {
      if (k === '__data') {
        continue
      }
      const child = {
        name: k,
        depth,
        children: descend(obj[k], depth + 1)
      }
      if ('__data' in obj[k]) {
        child.data = obj[k].__data
      }
      arr.push(child)
    }
    return arr
  }
  
  function burrow(table, taxonomy) {
    // create nested object
    const obj = {}
  
    table.forEach((row) => {
      // start at root
      let layer = obj
  
      // create children as nested objects
      taxonomy.forEach((t) => {
        const key = row[t.name].value
        layer[key] = key in layer ? layer[key] : {}
        layer = layer[key]
      })
      layer.__data = row
    })
  
    // use descend to create nested children arrays
    return {
      name: 'root',
      children: descend(obj, 1),
      depth: 0
    }
  }
  
  const visObject = {
   /**
    * Configuration options for your visualization. In Looker, these show up in the vis editor
    * panel but here, you can just manually set your default values in the code.
    **/
    options: {
      color_with_children: {
        label: 'Node Color With Children',
        default: '#36c1b3',
        type: 'string',
        display: 'color'
      },
      color_empty: {
        label: 'Empty Node Color',
        default: '#fff',
        type: 'string',
        display: 'color'
      }
    },
   
   /**
    * The create function gets called when the visualization is mounted but before any
    * data is passed to it.
    **/
      create: function(element, config){
        this.svg = d3.select(element).append('svg')
        this.depthColumnStates = [];
      },
  
   /**
    * UpdateAsync is the function that gets called (potentially) multiple times. It receives
    * the data and should update the visualization with the new data.
    **/
      updateAsync: function(data, element, config, queryResponse, details, doneRendering){
       if (!handleErrors(this, queryResponse, {
          min_pivots: 0, max_pivots: 0,
          min_dimensions: 2, max_dimensions: undefined,
          min_measures: 0, max_measures: undefined
        })) return
    
        let i = 0
        const nodeColors = {
          children: (config && config.color_with_children) || this.options.color_with_children.default,
          empty: (config && config.color_empty) || this.options.color_empty.default
        }
        const columnWidthSymbol = (x, y, size) => {
            size = size * .25; // adjusting size constant to match circle radius
            const path = `
            M ${x}, ${y}
            m 0, ${size * -4.5}
            h ${size * .5}
            v ${size * 9}
            h ${size * -1}
            v ${size * -9}
            h ${size * .5}

            m ${size * 2.5}, ${size * 4}
            h ${size * 2}
            l ${size * -1.75}, ${size * -1.75}
            a ${size * .375} ${size * .375} 180 1 1 ${size * .75}, ${size * -.75}
            l ${size * 3}, ${size * 3}
            l ${size * -3}, ${size * 3}
            a ${size * .375} ${size * .375} 180 1 1 ${size * -.75}, ${size * -.75}
            l ${size * 1.75}, ${size * -1.75}
            h ${size * -2}
            
            a ${size * .5} ${size * .5} 180 1 1 0, ${size * -1}


            m ${size * -5}, 0
            h ${size * -2}
            l ${size * 1.75}, ${size * -1.75}
            a ${size * .375} ${size * .375} 180 1 0 ${size * -.75}, ${size * -.75}
            l ${size * -3}, ${size * 3}
            l ${size * 3}, ${size * 3}
            a ${size * .375} ${size * .375} 180 1 0 ${size * .75}, ${size * -.75}
            l ${size * -1.75}, ${size * -1.75}
            h ${size * 2}
          `.trim()
    
          return path
          }
        
        const textSize = 10
        const nodeRadius = 4
        const sizerRadius = 7;
        const duration = d3.event && d3.event.altKey ? 2500 : 250;
        const margin = { top: 10, right: 10, bottom: 10, left: 10 }
        const width = element.clientWidth - margin.left - margin.right
        const height = element.clientHeight - margin.top - margin.bottom
        const nested = burrow(data, queryResponse.fields.dimension_like)

        // Create array to manage column widths
        let depthColumnStates = this.depthColumnStates;
        if (depthColumnStates.length == 0) {
          let maxDepth = queryResponse.fields.dimensions.length;
          for (let localMaxDepth = 0; localMaxDepth <= maxDepth; localMaxDepth++) {
            depthColumnStates[localMaxDepth] = { default: true, columnConfigs: [] };
            for (let depth = 0; depth <= localMaxDepth; depth++) {
              // Max depth
              nodeWidthPercent = 1 / (localMaxDepth + 1);
              nodeXPercent = nodeWidthPercent * depth;
              depthColumnStates[localMaxDepth].columnConfigs[depth] = {
                depth: depth,
                widthPercent: nodeXPercent
              };
            }
          }
        }
        
        const tree = d3.tree().size([height, width]);
    
        const root = d3.hierarchy(nested, (d) => d.children)
        root.x0 = height / 2;
        root.y0 = 0;
        root.descendants().forEach((d, i) => {
          d.id = i;
          d._children = d.children;
          // Starting condition, only first depth is visible
          if (d.depth > 0) d.children = null;
        });
        
        const svg = this.svg
          .html('')
          .attr('width', width + margin.right + margin.left)
          .attr('height', height + margin.top + margin.bottom)
          .attr('transform', `translate(${margin.left}, ${margin.top})`);
        
        const gLink = svg.append("g")
          .attr('class', 'link')
          .style('fill', 'none')
          .style('stroke', '#ddd')
          .style('stroke-width', 1.5)

        const gNode = svg.append("g")
          .attr("cursor", "pointer")
          .attr("pointer-events", "all");

        const gSizer = svg.append("g")
          .attr("cursor", "grab")
          .attr("pointer-events", "all")

        const sizerPositions = [];
        let prevDepth = 0;
    
        // define some helper functions that close over our local variables
        
        // Update the display for a given node
        function update(source) {
          const nodes = root.descendants().reverse();
          const links = root.links();

          // Compute the new tree layout.
          tree(root);

          let left = root;
          let right = root;
          root.eachBefore(node => {
            if (node.x < left.x) left = node;
            if (node.x > right.x) right = node;
          });
      
          const height = right.x - left.x + margin.top + margin.bottom;
          
          const transition = svg.transition()
            .duration(duration)
            .attr("viewBox", [-margin.left, left.x - margin.top, width, height])
            .tween("resize", window.ResizeObserver ? null : () => () => svg.dispatch("toggle"));

          // Update the nodes…
          const node = gNode.selectAll("g")
            .data(nodes, d => d.id);

          // Process x-pos & width for current depth
          let currentDepth = nodes[0].depth;
          let columnConfigs = depthColumnStates[currentDepth].columnConfigs;
          // Config has absolute position as percentage, need difference between columns
          let columnWidths = columnConfigs.map((columnConfig, i, array) => {
            nextPositionPercent = i < array.length - 1 ? array[i + 1].widthPercent : 1;
            widthPercent = nextPositionPercent - columnConfig.widthPercent;
            return widthPercent * width;
          })
          
          

          nodes.forEach((d) => {
            d.y = columnConfigs[d.depth].widthPercent * width;
          })
          
          // Enter any new nodes at the parent's previous position.
          const nodeEnter = node.enter().append('g')
              .attr('class', 'node')
              .attr('depth', d => d.depth)
              .attr('transform', (d) => `translate(${source.y0}, ${source.x0})`)
              .style('opacity', 0)
              .on("click", (event, d) => {
                d.children = d.children ? null : d._children;
                update(d);
              });
    
          // Add Circle for the nodes
          nodeEnter.append('circle')
            .attr('class', 'node')
            .attr('r', 0)

          // Add labels for the nodes
          nodeEnter
            .append('foreignObject')
            .style('font-family', "'Open Sans', Helvetica, sans-serif")
            .style('font-size', textSize + 'px')
            .attr('dy', '.35em')
            .call(addTextBox, columnWidths)
          
          // UPDATE
          const nodeUpdate = node.merge(nodeEnter).transition(transition)
            .attr('transform', d => `translate(${d.y}, ${d.x})`)
            .style('opacity', 1.0)
    
          // Update the node attributes and style
          nodeUpdate.select('circle.node')
            .attr('r', nodeRadius)
            .style('fill', (d) => d.children ? nodeColors.empty : nodeColors.children)
            .style('stroke', nodeColors.children)
            .style('stroke-width', 1.5)
    
          // Remove any exiting nodes
          const nodeExit = node.exit().transition(transition)
            .attr('transform', d => `translate(${source.y}, ${source.x})`)
            .remove();
    
          // On exit reduce the node circles size to 0
          nodeExit.select('circle')
            .attr('r', 0)
    
          // On exit reduce the opacity of text labels
          nodeExit.select('foreignObject')
            .style('opacity', 0)

    
          // ****************** links section ***************************
          let diagonal = d3.linkHorizontal().x(d => d.y).y(d => d.x)
    
          // Update the links...
          const link = gLink.selectAll('path')
              .data(links, d => d.target.id);

           // Enter any new links at the parent's previous position.
          const linkEnter = link.enter().append('path')
              .attr('sourceDepth', d => d.source.depth)
              .attr('targetDepth', d => d.target.depth)
              .attr('d', d => {
                const o = { x: source.x0, y: source.y0 }
                return diagonal({source: o, target: o});
              })

          // Transition links to their new position.
          link.merge(linkEnter).transition(transition)
            .attr("d", diagonal);

          // Transition exiting nodes to the parent's new position.
          link.exit().transition(transition).remove()
              .attr("d", d => {
                const o = {x: source.x, y: source.y};
                return diagonal({source: o, target: o});
              });

          // ****************** column sizer section ********************

          prevMaxWidth = depthColumnStates[prevDepth].columnConfigs[prevDepth].widthPercent * width;
          currentMaxWidth = columnConfigs.at(-1).widthPercent * width;



          const sizer = gSizer.selectAll("g")
            .data(columnConfigs.slice(1), d => d.depth)
                
          const sizerEnter = sizer.enter().append('g')
          
          sizerEnter
            .attr('transform', d => `translate(${prevMaxWidth}, ${sizerRadius/2})`)
            .style('opacity', 0.0)
            .call(d3.drag()
              .on("start", dragstarted)
              .on("drag", dragged)
              .on("end", dragended))
          
          sizerEnter.append("circle")
            .attr('r', sizerRadius)
            .style('opacity', 0.0)
          
          sizerEnter.append("path")
             .attr("d", columnWidthSymbol(0, 0, sizerRadius))
             .style('fill', 'grey')

          
          const sizerUpdate = sizer.merge(sizerEnter).transition()
            .duration(duration)
            .attr('transform', d => `translate(${(d.widthPercent * width)}, ${sizerRadius/2})`)
            .style('opacity', 1.0)
              
          sizer.exit()
            .transition()
            .duration(duration)
            .attr('transform', d => `translate(${currentMaxWidth}, ${sizerRadius/2})`)
            .style('opacity', 0.0)
            .remove()

            function dragstarted() {
              d3.select(this).raise();
              sizerEnter.attr("cursor", "grabbing");
            }
          
            function dragged(event, d) {
              d3.select(this)
                .attr('transform', d => `translate(${event.x}, ${sizerRadius/2})`);
              
              const newWidthPercent = event.x / width;
              depthColumnStates[d.depth].columnConfigs[d.depth].widthPercent = newWidthPercent;
              columnConfigs[d.depth].widthPercent = newWidthPercent;
              
              node.merge(nodeEnter).filter(`[depth="${d.depth}"]`)
                .transition()
                .duration(0)
                .attr('transform', d => `translate(${newWidthPercent * width}, ${d.x})`);

              gLink.selectAll('path')
                .transition()
                .duration(0)
                .attr("d", d => {
                  const sourcePos = depthColumnStates[d.source.depth + 1].columnConfigs[d.source.depth].widthPercent * width;
                  const targetPos = depthColumnStates[d.target.depth].columnConfigs[d.target.depth].widthPercent * width;
                  const newSource = {x: d.source.x, y: sourcePos};
                  console.log(currentDepth)
                  //const newTarget = {x: d.target.x, y: targetPos};
                  return diagonal({source: newSource, target: d.target});
                });
              
              // link.merge(linkEnter).filter(`[targetDepth="${d.depth}"]`)
              //   .transition()
              //   .duration(0)
              //   .attr("d", d => {
              //     const o = {x: d.target.x, y: newWidthPercent * width};
              //     return diagonal({source: d.source, target: o});
              //   });
            }
          
            function dragended() {
              sizerEnter.attr("cursor", "grab");
            }
          
          prevDepth = currentDepth;
          
          // Stash the old positions for transition.
          root.eachBefore(d => {
            d.x0 = d.x
            d.y0 = d.y
          })
    
        }
    
    
        // Update the root node
        update(root)
  
      }
  };
  
  looker.plugins.visualizations.add(visObject);