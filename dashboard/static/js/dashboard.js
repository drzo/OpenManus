document.addEventListener('DOMContentLoaded', function() {
    // Variables
    let socket;
    let selectedAgent = null;
    let currentTab = 'dashboard-tab';
    
    // DOM Elements
    const tabs = document.querySelectorAll('nav a');
    const tabContents = document.querySelectorAll('.tab-content');
    const agentButtons = document.querySelectorAll('.run-agent-button');
    const quickActionButtons = document.querySelectorAll('.action-button');
    const modal = document.getElementById('agent-prompt-modal');
    const closeModalBtn = document.querySelector('.modal-content .close');
    const cancelModalBtn = document.querySelector('.modal-content .cancel');
    const agentPromptForm = document.getElementById('agent-prompt-form');
    const executionView = document.getElementById('execution-view');
    const closeExecutionBtn = document.querySelector('.close-execution');
    const stopExecutionBtn = document.getElementById('stop-execution');
    const logsOutput = document.getElementById('logs-output');
    const activityFeed = document.getElementById('activity-feed');
    const usageChart = document.getElementById('usage-chart');

    // Initialize charts
    initializeCharts();
    
    // Connect to WebSocket
    connectWebSocket();
    
    // Initialize event listeners
    initializeEventListeners();

    // Functions
    function initializeCharts() {
        const ctx = usageChart.getContext('2d');
        const chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: Array.from({length: 7}, (_, i) => {
                    const d = new Date();
                    d.setDate(d.getDate() - i);
                    return d.toLocaleDateString();
                }).reverse(),
                datasets: [{
                    label: 'Agent Executions',
                    data: [3, 7, 5, 12, 8, 9, 6],
                    backgroundColor: 'rgba(74, 107, 175, 0.2)',
                    borderColor: '#4a6baf',
                    tension: 0.4,
                    borderWidth: 2,
                    pointBackgroundColor: '#4a6baf'
                }, {
                    label: 'Token Usage (K)',
                    data: [10, 15, 12, 25, 17, 19, 14],
                    backgroundColor: 'rgba(94, 187, 246, 0.2)',
                    borderColor: '#5ebbf6',
                    tension: 0.4,
                    borderWidth: 2,
                    pointBackgroundColor: '#5ebbf6'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        });
    }

    function connectWebSocket() {
        // Connect to WebSocket server
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws`;
        socket = new WebSocket(wsUrl);
        
        socket.onopen = function(e) {
            console.log('WebSocket connection established');
            addLogEntry('Connected to OpenManus Dashboard', 'info');
        };
        
        socket.onmessage = function(event) {
            handleWebSocketMessage(event.data);
        };
        
        socket.onclose = function(event) {
            console.log('WebSocket connection closed');
            addLogEntry('Disconnected from server. Reconnecting...', 'warning');
            
            // Try to reconnect after 5 seconds
            setTimeout(connectWebSocket, 5000);
        };
        
        socket.onerror = function(error) {
            console.error('WebSocket error:', error);
            addLogEntry('WebSocket connection error', 'error');
        };
    }

    function handleWebSocketMessage(message) {
        if (message.startsWith('LOG:')) {
            const logMessage = message.substring(4);
            addLogEntry(logMessage);
            addActivityEntry(logMessage);
        } else if (message.startsWith('STATUS:')) {
            const statusMessage = message.substring(7);
            addLogEntry(statusMessage, 'info');
            addActivityEntry(statusMessage);
        } else if (message.startsWith('ERROR:')) {
            const errorMessage = message.substring(6);
            addLogEntry(errorMessage, 'error');
            addActivityEntry(errorMessage);
        } else if (message.startsWith('RESULT:')) {
            const resultMessage = message.substring(7);
            document.getElementById('execution-output-text').innerHTML += resultMessage;
            addLogEntry('Agent execution completed', 'info');
        } else if (message.startsWith('AGENT:')) {
            const agentMessage = message.substring(6);
            document.getElementById('execution-output-text').innerHTML += agentMessage + '\n';
        } else {
            console.log('Received message:', message);
        }
    }

    function initializeEventListeners() {
        // Tab navigation
        tabs.forEach(tab => {
            tab.addEventListener('click', function(e) {
                e.preventDefault();
                const tabId = this.getAttribute('data-tab');
                switchTab(tabId);
            });
        });
        
        // Agent buttons
        agentButtons.forEach(button => {
            button.addEventListener('click', function() {
                selectedAgent = this.getAttribute('data-agent');
                document.getElementById('selected-agent-name').textContent = selectedAgent;
                modal.classList.add('active');
            });
        });
        
        // Quick action buttons
        quickActionButtons.forEach(button => {
            if (button.id === 'run-manus') {
                button.addEventListener('click', function() {
                    selectedAgent = 'Manus';
                    document.getElementById('selected-agent-name').textContent = selectedAgent;
                    modal.classList.add('active');
                });
            } else if (button.id === 'run-browser') {
                button.addEventListener('click', function() {
                    selectedAgent = 'BrowserAgent';
                    document.getElementById('selected-agent-name').textContent = selectedAgent;
                    modal.classList.add('active');
                });
            } else if (button.id === 'run-mcp') {
                button.addEventListener('click', function() {
                    selectedAgent = 'MCPAgent';
                    document.getElementById('selected-agent-name').textContent = selectedAgent;
                    modal.classList.add('active');
                });
            } else if (button.id === 'run-data') {
                button.addEventListener('click', function() {
                    selectedAgent = 'DataAnalysis';
                    document.getElementById('selected-agent-name').textContent = selectedAgent;
                    modal.classList.add('active');
                });
            }
        });
        
        // Close modal
        closeModalBtn.addEventListener('click', function() {
            modal.classList.remove('active');
        });
        
        // Cancel modal button
        cancelModalBtn.addEventListener('click', function() {
            modal.classList.remove('active');
        });
        
        // Agent prompt form submission
        agentPromptForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const prompt = document.getElementById('agent-prompt').value;
            runAgent(selectedAgent, prompt);
            modal.classList.remove('active');
            showExecutionView(selectedAgent, prompt);
        });
        
        // Close execution view
        closeExecutionBtn.addEventListener('click', hideExecutionView);
        
        // Stop execution
        stopExecutionBtn.addEventListener('click', function() {
            // TODO: Implement stopping agent execution
            addLogEntry('Stopping agent execution...', 'warning');
            hideExecutionView();
        });
        
        // Log filter
        document.getElementById('log-filter').addEventListener('change', function() {
            filterLogs(this.value);
        });
        
        // Clear logs
        document.getElementById('clear-logs').addEventListener('click', clearLogs);
        
        // Configuration form submission
        document.getElementById('config-form').addEventListener('submit', function(e) {
            e.preventDefault();
            saveConfiguration();
        });
    }

    function switchTab(tabId) {
        // Update active tab
        tabs.forEach(tab => {
            if (tab.getAttribute('data-tab') === tabId) {
                tab.classList.add('active');
            } else {
                tab.classList.remove('active');
            }
        });
        
        // Update visible tab content
        tabContents.forEach(content => {
            if (content.id === tabId) {
                content.classList.add('active');
            } else {
                content.classList.remove('active');
            }
        });
        
        currentTab = tabId;
    }

    function runAgent(agentType, prompt) {
        if (socket && socket.readyState === WebSocket.OPEN) {
            const message = `RUN:${agentType}|${prompt}`;
            socket.send(message);
            addLogEntry(`Starting ${agentType} agent with prompt: ${prompt}`, 'info');
            addActivityEntry(`Started ${agentType} agent`);
        } else {
            addLogEntry('WebSocket connection not available', 'error');
        }
    }

    function showExecutionView(agentType, prompt) {
        document.getElementById('running-agent-name').textContent = agentType;
        document.getElementById('execution-prompt-text').textContent = prompt;
        document.getElementById('execution-output-text').textContent = '';
        executionView.classList.remove('hidden');
    }

    function hideExecutionView() {
        executionView.classList.add('hidden');
    }

    function addLogEntry(message, level = 'info') {
        const logEntry = document.createElement('div');
        logEntry.classList.add('log-entry', `log-${level}`);
        
        const timestamp = new Date().toLocaleTimeString();
        logEntry.innerHTML = `<span class="log-timestamp">[${timestamp}]</span> ${message}`;
        
        logsOutput.appendChild(logEntry);
        logsOutput.scrollTop = logsOutput.scrollHeight;
    }

    function addActivityEntry(message) {
        // Remove placeholder if exists
        const placeholder = document.querySelector('.activity-placeholder');
        if (placeholder) {
            placeholder.remove();
        }
        
        const activityItem = document.createElement('div');
        activityItem.classList.add('activity-item');
        
        const timestamp = new Date().toLocaleTimeString();
        activityItem.innerHTML = `
            <div class="activity-timestamp">${timestamp}</div>
            <div class="activity-message">${message}</div>
        `;
        
        activityFeed.prepend(activityItem);
        
        // Keep only the latest 10 activities
        const activities = activityFeed.querySelectorAll('.activity-item');
        if (activities.length > 10) {
            for (let i = 10; i < activities.length; i++) {
                activities[i].remove();
            }
        }
    }

    function filterLogs(level) {
        const logEntries = logsOutput.querySelectorAll('.log-entry');
        
        logEntries.forEach(entry => {
            if (level === 'all' || entry.classList.contains(`log-${level}`)) {
                entry.style.display = 'block';
            } else {
                entry.style.display = 'none';
            }
        });
    }

    function clearLogs() {
        logsOutput.innerHTML = '';
        addLogEntry('Logs cleared', 'info');
    }

    function saveConfiguration() {
        const maxSteps = document.getElementById('max-steps').value;
        const timeout = document.getElementById('timeout').value;
        
        // TODO: Implement saving configuration
        addLogEntry(`Configuration saved: maxSteps=${maxSteps}, timeout=${timeout}s`, 'info');
    }
});