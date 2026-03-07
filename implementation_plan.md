# Implementation Plan: Seika Master (Phase 1)

## 1. Project Setup and Foundation
- [ ] Initialize/Refine basic directory structure (keeping existing Vite + React).
- [ ] Define global CSS variables for a "Fresh Market" aesthetic (Deep Green, Vibrant Orange, Soft Cream).
- [ ] Implement a mobile-first responsive Layout component with a bottom navigation bar.

## 2. Data Structure & State Management
- [ ] Implement `localStorage` based storage hooks for:
    - `targetData`: Monthly/Daily budgets for Vegetables, Fruits, and Total.
    - `inspectionData`: Daily entries for 12:00, 17:00, and Final status.
- [ ] Create utility functions for automatic calculations:
    - Achievement Rate (消化率)
    - Variance (予算差異)
    - Simple Linear Prediction (予想最終)

## 3. Phase 1 Features: Core Entry & Dashboard
- [ ] **Dashboard Home**:
    - [ ] Dynamic cards showing "Today's Status" (Goal vs. Current Actual).
    - [ ] Quick indicators for the next entry time (e.g., "Next: 12:00 Entry").
- [ ] **Entry Management (定時点検表)**:
    - [ ] Create a page for inputting data at 12:00, 17:00, and Closing.
    - [ ] Ensure inputs are large and Numeric-keyboard friendly for mobile.
    - [ ] Real-time calculation display (show variance as user types).
- [ ] **Data Table View**:
    - [ ] A horizontally scrollable list to view historical "定時点検表" entries.

## 4. UI Mocks for Future Phases
- [ ] **AI Support Page**:
    - [ ] Mock chat interface with predefined produce-related prompts.
- [ ] **Task (ToDo) Page**:
    - [ ] Mock task list generated from "AI analysis".
- [ ] **Analysis Page**:
    - [ ] Placeholders for CSV upload and OCR (Image upload) sections.
- [ ] **POP Tool Page**:
    - [ ] Mock interface for POP generation.

## 5. Verification 
- [ ] Test the data flow: Input at 12:00 -> Update Dashboard status.
- [ ] Verify responsiveness on mobile screen sizes.
