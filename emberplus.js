const { EmberClientEvent } = require('node-emberplus');

module.exports = function(RED) {
    // Only the main node logic here
    function EmberPlusGadgetsNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        // Get the server configuration
        this.server = RED.nodes.getNode(config.server);
        if (!this.server) {
            node.error("Server configuration not found");
            node.status({fill:"red",shape:"ring",text:"Server config missing"});
            return;
        }

        // Configuration
        this.oid = config.oid;
        this.outputFormat = config.outputFormat || 'array';

        // Subscribe to server status
        this.server.addStatusCallback((colour, message, extra) => {
            node.status({fill: colour, shape: "dot", text: message + (extra ? ": " + extra : "")});
        });

        // Handle incoming messages
        node.on('input', async function(msg) {
            if (!node.server.connected) {
                node.error("Not connected to Ember+ server");
                return;
            }

            try {
                // Use msg.oid if provided, otherwise use configured OID
                const oidToUse = msg.oid || this.oid;
                // Walk the OID path step by step to avoid PathDiscoveryFailureError
                const pathParts = oidToUse.split('.');
                let currentPath = '';
                let currentNode = null;
                
                for (const part of pathParts) {
                    currentPath = currentPath ? `${currentPath}.${part}` : part;
                    currentNode = await node.server.client.getElementByPathAsync(currentPath);
                    if (!currentNode) {
                        node.error(`Node not found at ${currentPath}`);
                        return;
                    }
                }

                const targetNode = currentNode;
                if (targetNode && targetNode.contents) {
                    const value = targetNode.contents.value;
                    const description = targetNode.contents.description;
                    const oid = oidToUse;
                    
                    if (this.outputFormat === 'object') {
                        msg.payload = { oid, value, description };
                    } else if (this.outputFormat === 'value') {
                        msg.payload = value;
                    } else {
                        msg.payload = [oid, value, description];
                    }
                    node.send(msg);
                } else {
                    node.error('Node not found or has no contents.');
                }
            } catch (err) {
                node.error('Error: ' + err);
            }
        });
    }

    // Register only the main node
    RED.nodes.registerType("emberplus-gadget", EmberPlusGadgetsNode);
} 