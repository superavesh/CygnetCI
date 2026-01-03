// src/components/tables/ReleaseFilter.tsx

'use client';

import React, { useState } from 'react';
import { Search, X, HelpCircle } from 'lucide-react';

interface ReleaseFilterProps {
  onFilter: (query: string) => void;
  placeholder?: string;
}

export const ReleaseFilter: React.FC<ReleaseFilterProps> = ({
  onFilter,
  placeholder = "Search releases... (e.g., status=active or name:production)"
}) => {
  const [query, setQuery] = useState('');
  const [showHelp, setShowHelp] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    onFilter(value);
  };

  const handleClear = () => {
    setQuery('');
    onFilter('');
  };

  return (
    <div className="space-y-3">
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />

        <input
          type="text"
          value={query}
          onChange={handleChange}
          placeholder={placeholder}
          className="w-full pl-10 pr-20 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-gray-900 placeholder-gray-400"
        />

        <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex items-center space-x-2">
          {query && (
            <button
              onClick={handleClear}
              className="p-1 hover:bg-gray-100 rounded-full transition-colors"
              title="Clear search"
            >
              <X className="h-4 w-4 text-gray-500" />
            </button>
          )}

          <button
            onClick={() => setShowHelp(!showHelp)}
            className="p-1 hover:bg-blue-50 rounded-full transition-colors"
            title="Show help"
          >
            <HelpCircle className="h-5 w-5 text-blue-500" />
          </button>
        </div>
      </div>

      {/* Help Text */}
      {showHelp && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm">
          <h4 className="font-semibold text-blue-900 mb-2">🔍 Search Syntax:</h4>

          <div className="space-y-2 text-blue-800">
            <div>
              <strong>Exact Match (=):</strong>
              <div className="ml-4 mt-1 space-y-1">
                <div><code className="bg-blue-100 px-2 py-0.5 rounded">status=active</code> - Status is exactly "active"</div>
                <div><code className="bg-blue-100 px-2 py-0.5 rounded">version=v1.0.0</code> - Version is exactly "v1.0.0"</div>
              </div>
            </div>

            <div className="mt-3">
              <strong>Contains (:):</strong>
              <div className="ml-4 mt-1 space-y-1">
                <div><code className="bg-blue-100 px-2 py-0.5 rounded">name:prod</code> - Name contains "prod"</div>
                <div><code className="bg-blue-100 px-2 py-0.5 rounded">description:deploy</code> - Description contains "deploy"</div>
              </div>
            </div>

            <div className="mt-3">
              <strong>Multiple Filters (AND logic):</strong>
              <div className="ml-4 mt-1">
                <div><code className="bg-blue-100 px-2 py-0.5 rounded">status=active name:prod</code></div>
              </div>
            </div>

            <div className="mt-3">
              <strong>Available Columns:</strong>
              <div className="ml-4 mt-1 text-xs">
                name, description, status, version, created_by
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Active Filters Display */}
      {query && (
        <div className="flex flex-wrap gap-2">
          {parseFilters(query).map((filter, index) => (
            <div
              key={index}
              className="inline-flex items-center space-x-2 bg-blue-600 text-white px-3 py-1 rounded-full text-sm"
            >
              <span className="font-medium">{filter.column}</span>
              <span className="text-blue-200">{filter.operator === '=' ? '=' : '⊇'}</span>
              <span>{filter.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Helper function to parse filter query
interface ParsedFilter {
  column: string;
  operator: '=' | ':';
  value: string;
}

function parseFilters(query: string): ParsedFilter[] {
  const filters: ParsedFilter[] = [];

  // Split by spaces to get individual filters
  const parts = query.trim().split(/\s+/);

  for (const part of parts) {
    // Check for exact match (=)
    if (part.includes('=')) {
      const [column, value] = part.split('=');
      if (column && value) {
        filters.push({ column: column.trim(), operator: '=', value: value.trim() });
      }
    }
    // Check for contains (:)
    else if (part.includes(':')) {
      const [column, value] = part.split(':');
      if (column && value) {
        filters.push({ column: column.trim(), operator: ':', value: value.trim() });
      }
    }
  }

  return filters;
}

// Export the filter logic for use in the page
export function filterReleases<T extends Record<string, any>>(items: T[], query: string): T[] {
  if (!query.trim()) return items;

  const filters = parseFilters(query);
  if (filters.length === 0) return items;

  return items.filter(item => {
    // All filters must match (AND logic)
    return filters.every(filter => {
      const columnValue = String(item[filter.column] || '').toLowerCase();
      const searchValue = filter.value.toLowerCase();

      if (filter.operator === '=') {
        // Exact match
        return columnValue === searchValue;
      } else {
        // Contains (like SQL LIKE '%value%')
        return columnValue.includes(searchValue);
      }
    });
  });
}
