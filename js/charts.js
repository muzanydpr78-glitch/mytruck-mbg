/**
 * Web Monitoring Armada - Chart.js Manager
 * Visualisasi data distribusi armada, muatan, dan retur
 */

class ChartManager {
  constructor() {
    this.charts = {};
  }

  // Helper to destroy existing chart if present
  destroyChart(id) {
    if (this.charts[id]) {
      this.charts[id].destroy();
      delete this.charts[id];
    }
  }

  // --- Dashboard 3.1: Bar Chart Depo Distribution ---
  renderDepoDistributionChart(canvasId, labels, data) {
    this.destroyChart(canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    // Palette with sleek modern gradients
    const colors = [
      'rgba(59, 130, 246, 0.85)', // Blue
      'rgba(16, 185, 129, 0.85)', // Emerald
      'rgba(245, 158, 11, 0.85)', // Amber
      'rgba(139, 92, 246, 0.85)', // Purple
      'rgba(14, 165, 233, 0.85)', // Sky
      'rgba(239, 68, 68, 0.85)'   // Red
    ];

    this.charts[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Jumlah Armada',
          data: data,
          backgroundColor: colors.slice(0, labels.length),
          borderColor: 'rgba(255, 255, 255, 0.1)',
          borderWidth: 1,
          borderRadius: 6,
          maxBarThickness: 45
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1E293B',
            titleColor: '#F8FAFC',
            bodyColor: '#94A3B8',
            borderColor: '#334155',
            borderWidth: 1,
            padding: 12,
            displayColors: false,
            callbacks: {
              label: (context) => `Total Unit: ${context.parsed.y} Armada`
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              color: '#94A3B8',
              font: { family: "'Plus Jakarta Sans', sans-serif", size: 11 },
              maxRotation: 25,
              minRotation: 0
            }
          },
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: {
              stepSize: 1,
              color: '#94A3B8',
              font: { family: "'Plus Jakarta Sans', sans-serif", size: 11 }
            }
          }
        }
      }
    });
  }

  // --- Dashboard 3.1: Pie Chart Tipe Muatan (JUGS, SPS, MIX) ---
  renderTipeMuatanChart(canvasId, labels, data) {
    this.destroyChart(canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    this.charts[canvasId] = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: data,
          backgroundColor: [
            '#06B6D4', // Cyan for JUGS
            '#10B981', // Emerald for SPS
            '#8B5CF6'  // Purple for MIX
          ],
          borderColor: '#0F172A',
          borderWidth: 3,
          hoverOffset: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '68%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: '#E2E8F0',
              font: { family: "'Plus Jakarta Sans', sans-serif", size: 12 },
              padding: 16,
              usePointStyle: true,
              pointStyle: 'circle'
            }
          },
          tooltip: {
            backgroundColor: '#1E293B',
            titleColor: '#F8FAFC',
            bodyColor: '#94A3B8',
            borderColor: '#334155',
            borderWidth: 1,
            padding: 12,
            callbacks: {
              label: (context) => {
                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                const val = context.parsed;
                const pct = total > 0 ? ((val / total) * 100).toFixed(1) : 0;
                return ` ${context.label}: ${val} Unit (${pct}%)`;
              }
            }
          }
        }
      }
    });
  }

  // --- Dashboard 3.3: Trendline Muatan Weekly (In Box vs In Jugs) ---
  renderTrendlineMuatan(canvasId, labels, dataBox, dataJugs) {
    this.destroyChart(canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    this.charts[canvasId] = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'In Box',
            data: dataBox,
            borderColor: '#3B82F6', // Blue
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            fill: true,
            tension: 0.35,
            pointBackgroundColor: '#3B82F6',
            pointRadius: 4,
            pointHoverRadius: 6,
            borderWidth: 2.5
          },
          {
            label: 'In Jugs',
            data: dataJugs,
            borderColor: '#10B981', // Emerald Green
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            fill: true,
            tension: 0.35,
            pointBackgroundColor: '#10B981',
            pointRadius: 4,
            pointHoverRadius: 6,
            borderWidth: 2.5
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          legend: {
            position: 'top',
            align: 'end',
            labels: {
              color: '#CBD5E1',
              font: { family: "'Plus Jakarta Sans', sans-serif", size: 11 },
              usePointStyle: true,
              boxWidth: 8
            }
          },
          tooltip: {
            backgroundColor: '#1E293B',
            titleColor: '#F8FAFC',
            bodyColor: '#CBD5E1',
            borderColor: '#334155',
            borderWidth: 1,
            padding: 12
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(255, 255, 255, 0.03)' },
            ticks: {
              color: '#94A3B8',
              font: { size: 10 }
            }
          },
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: {
              color: '#94A3B8',
              font: { size: 10 }
            }
          }
        }
      }
    });
  }

  // --- Dashboard 3.3: Trendline Retur Weekly (Retur Box vs Retur Jugs) ---
  renderTrendlineRetur(canvasId, labels, returBox, returJugs) {
    this.destroyChart(canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    this.charts[canvasId] = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Retur Box',
            data: returBox,
            borderColor: '#F59E0B', // Amber
            backgroundColor: 'rgba(245, 158, 11, 0.1)',
            fill: true,
            tension: 0.35,
            pointBackgroundColor: '#F59E0B',
            pointRadius: 4,
            pointHoverRadius: 6,
            borderWidth: 2.5
          },
          {
            label: 'Retur Jugs',
            data: returJugs,
            borderColor: '#EF4444', // Red / Rose
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            fill: true,
            tension: 0.35,
            pointBackgroundColor: '#EF4444',
            pointRadius: 4,
            pointHoverRadius: 6,
            borderWidth: 2.5
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          legend: {
            position: 'top',
            align: 'end',
            labels: {
              color: '#CBD5E1',
              font: { family: "'Plus Jakarta Sans', sans-serif", size: 11 },
              usePointStyle: true,
              boxWidth: 8
            }
          },
          tooltip: {
            backgroundColor: '#1E293B',
            titleColor: '#F8FAFC',
            bodyColor: '#CBD5E1',
            borderColor: '#334155',
            borderWidth: 1,
            padding: 12
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(255, 255, 255, 0.03)' },
            ticks: {
              color: '#94A3B8',
              font: { size: 10 }
            }
          },
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: {
              color: '#94A3B8',
              font: { size: 10 }
            }
          }
        }
      }
    });
  }
}

// Global instance
window.chartManager = new ChartManager();
