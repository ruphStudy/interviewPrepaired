# Reporting Dashboard - Architecture

Complete architecture documentation for the AI Interview Coach Reporting Dashboard.

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Component Architecture](#component-architecture)
3. [State Management](#state-management)
4. [Data Flow](#data-flow)
5. [API Integration](#api-integration)
6. [Export System](#export-system)
7. [Responsive Design](#responsive-design)
8. [Performance Optimization](#performance-optimization)
9. [Type System](#type-system)
10. [Testing Strategy](#testing-strategy)

---

## 🎯 Overview

### Design Principles

1. **Component Composition**: Small, reusable components following single responsibility
2. **Type Safety**: Complete TypeScript coverage with strict mode
3. **Performance First**: Optimized rendering and bundle size
4. **Accessibility**: WCAG 2.1 AA compliant
5. **Responsive**: Mobile-first design approach
6. **Maintainable**: Clear separation of concerns and comprehensive documentation

### Technology Stack

- **React 18**: UI framework with concurrent features
- **TypeScript 5**: Type safety and developer experience
- **Recharts**: Charting library built on D3
- **Tailwind CSS**: Utility-first styling
- **Zustand** (optional): Global state management

---

## 🏗️ Component Architecture

### Component Hierarchy

```
ReportingDashboard (Container)
├── SummaryCards (Data Display)
│   └── SummaryCard × 6
├── Charts (Visualization)
│   ├── ScoreRadarChart
│   ├── ScoreTrendChart
│   └── TopicPerformanceChart
├── Sections (Content)
│   ├── StrengthsSection
│   ├── WeaknessesSection
│   ├── SuggestionsSection
│   ├── RecommendedTopicsSection
│   └── InterviewHistorySection
└── ExportPanel (Actions)
```

### File Structure

```
ReportingDashboard/
├── Dashboard.tsx              # Main container component
├── SummaryCards.tsx          # Score cards
├── Charts.tsx                # All chart components
├── Sections.tsx              # Content sections
├── ExportPanel.tsx           # Export functionality
├── types.ts                  # Type definitions (40+ types)
├── useReportData.ts          # Data fetching hook
├── useDashboardState.ts      # UI state management
├── exportUtils.ts            # Export utilities
├── index.ts                  # Barrel exports
├── README.md                 # User documentation
└── ARCHITECTURE.md           # This file
```

### Component Design Patterns

#### 1. Container/Presentational Pattern

```tsx
// Container (Dashboard.tsx)
const ReportingDashboard = ({ interviewId }) => {
  const { data, loading, error } = useReportData({ interviewId });
  return <PresentationalComponent data={data} />;
};

// Presentational (SummaryCards.tsx)
const SummaryCards = ({ scores, grade }) => {
  return <div>{/* Pure rendering logic */}</div>;
};
```

#### 2. Custom Hooks Pattern

```tsx
// Data fetching
const { data, loading, error, refetch } = useReportData(options);

// State management
const { view, setView, filters, setFilters } = useDashboardState(options);
```

#### 3. Compound Components Pattern

```tsx
<ChartContainer title="Performance Radar">
  <RadarChart data={data}>
    <PolarGrid />
    <PolarAngleAxis />
    <Radar />
  </RadarChart>
</ChartContainer>
```

---

## 🔄 State Management

### Local State

Each component manages its own UI state:

```tsx
const [showAll, setShowAll] = useState(false);
const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('pdf');
```

### Dashboard State (useDashboardState)

Centralized UI state management:

```typescript
interface DashboardState {
  view: DashboardView;                    // 'overview' | 'detailed' | 'comparison'
  filters: DashboardFilters;              // Active filters
  selectedInterview: string | null;       // Current selection
  compareInterviews: string[];            // Comparison list
  isLoading: boolean;                     // Loading state
  error: Error | null;                    // Error state
}
```

**Actions**:
- `setView(view)`: Change dashboard view
- `setFilters(filters)`: Apply filters
- `selectInterview(id)`: Select interview
- `addToComparison(id)`: Add to comparison
- `setLoading(bool)`: Set loading state
- `setError(error)`: Set error state

### Data State (useReportData)

Manages remote data:

```typescript
interface UseReportDataReturn {
  data: ReportData | null;     // Report data
  isLoading: boolean;           // Fetch status
  error: Error | null;          // Fetch error
  refetch: () => Promise<void>; // Manual refetch
}
```

### State Flow

```
User Action
    ↓
Dashboard Component
    ↓
useDashboardState (UI state)
    ↓
useReportData (Data fetch)
    ↓
API Service
    ↓
Backend API
    ↓
Data returned
    ↓
Component Re-render
```

---

## 📊 Data Flow

### Data Fetching Flow

```
1. Component Mount
   ↓
2. useReportData hook initialized
   ↓
3. Auto-fetch triggered (if autoFetch=true)
   ↓
4. ReportApiService.fetchReport()
   ↓
5. HTTP Request to backend
   ↓
6. Response received
   ↓
7. Data transformation & aggregation
   ↓
8. State updated
   ↓
9. Component re-renders with data
```

### Data Transformation

```typescript
// Raw API Response
{
  interview: InterviewSession,
  evaluations: EvaluationResult[]
}

// Transformed to ReportData
{
  interview: InterviewSession,
  evaluations: EvaluationResult[],
  aggregatedScores: ScoreBreakdown,        // ← Calculated
  overallGrade: Grade,                      // ← Calculated
  strengths: string[],                      // ← Extracted & deduplicated
  weaknesses: string[],                     // ← Extracted & deduplicated
  suggestions: string[],                    // ← Extracted & deduplicated
  recommendedTopics: RecommendedTopic[],   // ← Generated
  performanceByTopic: TopicPerformance[],  // ← Aggregated
  historicalTrend: ScoreTrendPoint[],      // ← Time series
}
```

### Aggregation Functions

#### Score Aggregation

```typescript
function aggregateScores(evaluations: EvaluationResult[]): ScoreBreakdown {
  const sum = evaluations.reduce((acc, eval) => ({
    technical: acc.technical + eval.scores.technical,
    communication: acc.communication + eval.scores.communication,
    // ... other dimensions
  }), initialValue);
  
  const count = evaluations.length;
  
  return {
    technical: Math.round((sum.technical / count) * 10) / 10,
    // ... other dimensions (rounded to 1 decimal)
  };
}
```

#### Strengths/Weaknesses Extraction

```typescript
function extractStrengths(evaluations: EvaluationResult[]): string[] {
  const allStrengths = evaluations.flatMap(e => e.strengths);
  const unique = Array.from(new Set(allStrengths));
  return unique.slice(0, 10); // Top 10
}
```

---

## 🔌 API Integration

### API Service Architecture

```typescript
class ReportApiService {
  private baseUrl = '/api/v1';
  
  async fetchReport(request: ReportRequest): Promise<ApiResponse<ReportData>> {
    // HTTP request
    // Error handling
    // Response transformation
  }
  
  async fetchInterview(id: string): Promise<ApiResponse<InterviewSession>> {}
  async fetchEvaluations(id: string): Promise<ApiResponse<EvaluationResult[]>> {}
  async fetchTrend(userId: string): Promise<ApiResponse<ScoreTrendPoint[]>> {}
  async fetchTopicPerformance(userId: string): Promise<ApiResponse<TopicPerformance[]>> {}
}
```

### API Endpoints

#### POST /api/v1/reports

**Request**:
```json
{
  "interviewId": "interview-123",
  "userId": "user-456",
  "filters": {
    "interviewType": "React",
    "dateRange": {
      "start": "2026-01-01",
      "end": "2026-06-09"
    }
  }
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "interview": { ... },
    "evaluations": [ ... ],
    "aggregatedScores": { ... },
    "overallGrade": "Good",
    "strengths": [ ... ],
    "weaknesses": [ ... ],
    "suggestions": [ ... ],
    "recommendedTopics": [ ... ],
    "performanceByTopic": [ ... ],
    "historicalTrend": [ ... ]
  },
  "metadata": {
    "timestamp": "2026-06-09T12:00:00Z",
    "requestId": "req-789"
  }
}
```

### Error Handling

```typescript
try {
  const response = await apiService.fetchReport(request);
  if (!response.success) {
    throw new Error(response.error?.message || 'API error');
  }
  return response.data;
} catch (error) {
  // Log error
  console.error('Failed to fetch report:', error);
  
  // Set error state
  setError(error instanceof Error ? error : new Error('Unknown error'));
  
  // Show user-friendly message
  showErrorNotification('Unable to load report. Please try again.');
}
```

### Retry Logic

```typescript
async function fetchWithRetry<T>(
  fetchFn: () => Promise<T>,
  maxRetries = 3
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fetchFn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await delay(Math.pow(2, i) * 1000); // Exponential backoff
    }
  }
  throw new Error('Max retries exceeded');
}
```

---

## 📤 Export System

### Export Architecture

```
User clicks Export
    ↓
ExportPanel collects options
    ↓
exportReport(data, format, options)
    ↓
Format-specific handler:
  ├── exportToPDF()
  ├── exportToCSV()
  └── exportToJSON()
    ↓
File generated
    ↓
Browser download triggered
```

### PDF Export

Uses jsPDF library:

```typescript
async function exportToPDF(data: ReportData, options: ExportOptions) {
  const doc = new jsPDF();
  
  // Add title
  doc.setFontSize(20);
  doc.text('Interview Report', 20, 20);
  
  // Add scores
  doc.setFontSize(12);
  doc.text(`Overall: ${data.aggregatedScores.overall}/10`, 20, 40);
  
  // Add sections (strengths, weaknesses, etc.)
  
  // Save file
  doc.save(`interview-report-${data.interview.id}.pdf`);
}
```

### CSV Export

Custom CSV generation:

```typescript
async function exportToCSV(data: ReportData, options: ExportOptions) {
  // Convert to CSV format
  const csvContent = convertToCSV({
    headers: ['Dimension', 'Score'],
    rows: [
      ['Technical', data.aggregatedScores.technical],
      ['Communication', data.aggregatedScores.communication],
      // ... other rows
    ]
  });
  
  // Download blob
  const blob = new Blob([csvContent], { type: 'text/csv' });
  downloadBlob(blob, `report-${Date.now()}.csv`);
}
```

### JSON Export

Structured data export:

```typescript
async function exportToJSON(data: ReportData, options: ExportOptions) {
  const exportData = {
    metadata: {
      exportedAt: new Date().toISOString(),
      version: '1.0',
    },
    interview: data.interview,
    scores: data.aggregatedScores,
    // ... other data
  };
  
  const jsonString = JSON.stringify(exportData, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  downloadBlob(blob, `report-${Date.now()}.json`);
}
```

---

## 📱 Responsive Design

### Breakpoint Strategy

```typescript
interface Breakpoints {
  mobile: 0,      // 0-639px
  tablet: 640,    // 640-1023px
  desktop: 1024,  // 1024-1279px
  wide: 1280,     // 1280px+
}
```

### Responsive Grid System

#### Summary Cards

```tsx
// Mobile: 1 column
// Tablet: 2 columns
// Desktop: 3 columns
// Wide: 6 columns
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
  {cards.map(card => <SummaryCard {...card} />)}
</div>
```

#### Charts

```tsx
// Mobile: Stack vertically (1 column)
// Desktop: Side by side (2 columns)
<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
  <ScoreRadarChart />
  <TopicPerformanceChart />
</div>
```

#### Sections

```tsx
// Mobile: Stack vertically
// Desktop: 2 column layout
<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
  <div>
    <StrengthsSection />
    <SuggestionsSection />
  </div>
  <div>
    <WeaknessesSection />
    <RecommendedTopicsSection />
  </div>
</div>
```

### Responsive Charts

Recharts ResponsiveContainer adapts to parent:

```tsx
<ResponsiveContainer width="100%" height="100%">
  <RadarChart data={data}>
    {/* Chart content */}
  </RadarChart>
</ResponsiveContainer>
```

### Mobile Optimizations

1. **Touch Targets**: Minimum 44x44px for buttons
2. **Font Sizes**: Scaled for readability (min 14px)
3. **Spacing**: Adequate padding for finger taps
4. **Scroll Behavior**: Smooth scrolling enabled
5. **Chart Interactions**: Touch-friendly tooltips

---

## ⚡ Performance Optimization

### Code Splitting

```tsx
// Lazy load charts (reduces initial bundle)
const RadarChart = React.lazy(() => import('./RadarChart'));
const TrendChart = React.lazy(() => import('./TrendChart'));

// Use with Suspense
<Suspense fallback={<Loading />}>
  <RadarChart data={data} />
</Suspense>
```

### Memoization

```tsx
// Memoize expensive calculations
const aggregatedScores = useMemo(
  () => aggregateScores(evaluations),
  [evaluations]
);

// Memoize callbacks
const handleExport = useCallback(
  (format: ExportFormat) => {
    exportReport(data, format, options);
  },
  [data, options]
);

// Memoize components
const SummaryCard = React.memo<SummaryCardProps>(({ title, score }) => {
  return <div>{/* ... */}</div>;
});
```

### Render Optimization

```tsx
// Avoid inline objects/functions
// ❌ Bad
<Component style={{ margin: 10 }} onClick={() => handleClick()} />

// ✅ Good
const style = useMemo(() => ({ margin: 10 }), []);
const onClick = useCallback(() => handleClick(), []);
<Component style={style} onClick={onClick} />
```

### Data Fetching Optimization

```tsx
// Debounce search/filter inputs
const debouncedFilter = useMemo(
  () => debounce((value) => setFilters({ search: value }), 300),
  []
);

// Cache API responses
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      cacheTime: 10 * 60 * 1000, // 10 minutes
    },
  },
});
```

### Bundle Size Optimization

- **Tree shaking**: Only import needed components
- **Code splitting**: Lazy load heavy components
- **Dynamic imports**: Load on demand

```tsx
// ❌ Imports entire library
import _ from 'lodash';

// ✅ Import only needed function
import debounce from 'lodash/debounce';
```

---

## 📐 Type System

### Type Hierarchy

```
Base Types
├── Score (number 0-10)
├── Grade (enum)
└── InterviewType (enum)

Data Types
├── ScoreBreakdown (5 dimensions + overall)
├── EvaluationResult (single question)
├── InterviewSession (metadata)
└── ReportData (complete report)

Component Props
├── DashboardProps
├── SummaryCardProps
├── ChartContainerProps
└── SectionProps

Utility Types
├── ApiResponse<T>
├── PaginatedResponse<T>
└── ExportOptions
```

### Type Safety Patterns

#### Discriminated Unions

```typescript
type ApiResponse<T> = 
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string } };

function handleResponse<T>(response: ApiResponse<T>) {
  if (response.success) {
    // TypeScript knows response.data exists
    return response.data;
  } else {
    // TypeScript knows response.error exists
    throw new Error(response.error.message);
  }
}
```

#### Branded Types

```typescript
// Ensure scores are validated
type ValidatedScore = number & { __brand: 'ValidatedScore' };

function validateScore(score: number): ValidatedScore {
  if (score < 0 || score > 10) {
    throw new Error('Score must be between 0 and 10');
  }
  return score as ValidatedScore;
}
```

#### Type Guards

```typescript
export function isValidScore(value: unknown): value is Score {
  return typeof value === 'number' && value >= 0 && value <= 10;
}

export function isValidGrade(value: unknown): value is Grade {
  return Object.values(Grade).includes(value as Grade);
}
```

---

## 🧪 Testing Strategy

### Unit Tests

Test individual components in isolation:

```tsx
import { render, screen } from '@testing-library/react';
import { SummaryCard } from './SummaryCards';

describe('SummaryCard', () => {
  it('renders score correctly', () => {
    render(<SummaryCard title="Technical" score={8.5} />);
    expect(screen.getByText('8.5')).toBeInTheDocument();
  });
  
  it('displays trend when provided', () => {
    render(
      <SummaryCard
        title="Technical"
        score={8.5}
        previousScore={7.0}
      />
    );
    expect(screen.getByText(/\+21.4%/)).toBeInTheDocument();
  });
});
```

### Integration Tests

Test component interactions:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReportingDashboard } from './Dashboard';

describe('ReportingDashboard', () => {
  it('loads and displays report data', async () => {
    render(<ReportingDashboard interviewId="test-123" />);
    
    await waitFor(() => {
      expect(screen.getByText(/Overall Score/i)).toBeInTheDocument();
    });
  });
  
  it('allows exporting report', async () => {
    const onExport = jest.fn();
    render(<ReportingDashboard interviewId="test-123" onExport={onExport} />);
    
    const exportButton = screen.getByText(/Export/i);
    await userEvent.click(exportButton);
    
    expect(onExport).toHaveBeenCalledWith('pdf', expect.any(Object));
  });
});
```

### Snapshot Tests

Prevent unintended UI changes:

```tsx
import { render } from '@testing-library/react';
import { SummaryCards } from './SummaryCards';

it('matches snapshot', () => {
  const { container } = render(
    <SummaryCards
      scores={mockScores}
      grade="Good"
    />
  );
  expect(container).toMatchSnapshot();
});
```

### E2E Tests (Cypress/Playwright)

Test complete user flows:

```typescript
describe('Report Dashboard E2E', () => {
  it('completes full export flow', () => {
    cy.visit('/report/interview-123');
    cy.contains('Export Report').click();
    cy.get('[data-testid="format-pdf"]').click();
    cy.contains('Export as PDF').click();
    cy.contains('Export successful');
  });
});
```

---

## 🔒 Security Considerations

### Data Sanitization

```typescript
// Sanitize user input before displaying
import DOMPurify from 'dompurify';

function SectionItem({ content }: { content: string }) {
  const sanitized = DOMPurify.sanitize(content);
  return <div dangerouslySetInnerHTML={{ __html: sanitized }} />;
}
```

### API Security

```typescript
// Include authentication token
const response = await fetch(url, {
  headers: {
    'Authorization': `Bearer ${getAuthToken()}`,
    'X-CSRF-Token': getCsrfToken(),
  },
});

// Validate API responses
function validateReportData(data: unknown): ReportData {
  return ReportDataSchema.parse(data); // Throws if invalid
}
```

### Export Security

```typescript
// Limit export file size
if (estimateExportSize(data, format) > MAX_FILE_SIZE_MB * 1024) {
  throw new Error('Export file too large');
}

// Sanitize filenames
function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-z0-9.-]/gi, '_');
}
```

---

## 📈 Scalability

### Handling Large Datasets

```tsx
// Virtualize long lists
import { FixedSizeList } from 'react-window';

<FixedSizeList
  height={400}
  itemCount={interviews.length}
  itemSize={80}
>
  {({ index, style }) => (
    <InterviewItem
      key={interviews[index].id}
      interview={interviews[index]}
      style={style}
    />
  )}
</FixedSizeList>
```

### Pagination

```tsx
function useReportData(options) {
  const [page, setPage] = useState(1);
  const { data, hasMore } = usePaginatedFetch(options, page);
  
  return {
    data,
    hasMore,
    loadMore: () => setPage(p => p + 1),
  };
}
```

### Caching Strategy

```typescript
// Cache report data for 5 minutes
const cache = new Map<string, { data: ReportData; timestamp: number }>();

function getCachedReport(id: string): ReportData | null {
  const cached = cache.get(id);
  if (!cached) return null;
  
  const age = Date.now() - cached.timestamp;
  if (age > 5 * 60 * 1000) {
    cache.delete(id);
    return null;
  }
  
  return cached.data;
}
```

---

**Version**: 1.0.0  
**Last Updated**: June 9, 2026  
**Status**: ✅ Production Ready
