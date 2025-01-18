# Testing Setup Guide

This project uses Vitest as its testing framework. Here's everything you need to know about the testing setup:

## Running Tests

```bash
# Run tests once and to test if functionality works after changes
npm run test:run

# Run tests in watch mode (useful during development)
npm run test:watch

# Run tests before packaging
npm run package  # This will run tests before building
```

## Test File Structure

- All test files should be placed in `src/**/__tests__/` directories
- Test files should be named `*.test.ts`
- Each test file should correspond to a source file (e.g., `importManager.test.ts` tests `importManager.ts`)

## Mocking Dependencies

### VSCode API

Use the `test-utils.ts` helper to mock VSCode:

```typescript
import { createMockVscode } from "./test-utils";
vi.mock("vscode", () => createMockVscode());
```

### TypeScript API

Mock TypeScript using Vitest's mocking utilities:

```typescript
vi.mock("typescript", () => {
  const actual = vi.importActual("typescript");
  return {
    ...actual,
    sys: {
      fileExists: vi.fn(),
      // ... other mocks
    },
  };
});
```

## Best Practices

1. **Test Organization**

   ```typescript
   describe("ComponentName", () => {
     describe("methodName", () => {
       it("should do something specific", () => {
         // Test case
       });
     });
   });
   ```

2. **Mocking**

   - Use `vi.fn()` for function mocks
   - Use `vi.spyOn()` for spying on existing methods
   - Always reset mocks in `beforeEach`

   ```typescript
   beforeEach(() => {
     vi.resetModules();
     vi.clearAllMocks();
   });
   ```

3. **Test Cases**

   - Test both success and error cases
   - Test edge cases and boundary conditions
   - Use descriptive test names that explain the behavior being tested

4. **Assertions**
   ```typescript
   expect(result).toBe(expected);
   expect(mockFunction).toHaveBeenCalledWith(expectedArgs);
   ```

## Example Test File

Here's a template for writing tests:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { YourClass } from "../yourClass";
import * as vscode from "vscode";
import { createMockVscode } from "./test-utils";

// Mock VSCode
vi.mock("vscode", () => createMockVscode());

describe("YourClass", () => {
  let instance: YourClass;
  let mockDependency: vi.SpyInstance;

  beforeEach(() => {
    vi.resetModules();
    instance = new YourClass();
    mockDependency = vi.spyOn(vscode.workspace, "someMethod");
  });

  describe("yourMethod", () => {
    it("should handle successful case", async () => {
      // Arrange
      mockDependency.mockResolvedValue(expectedValue);

      // Act
      const result = await instance.yourMethod();

      // Assert
      expect(result).toBe(expectedValue);
      expect(mockDependency).toHaveBeenCalled();
    });

    it("should handle error case", async () => {
      // Arrange
      mockDependency.mockRejectedValue(new Error("Test error"));

      // Act & Assert
      await expect(instance.yourMethod()).rejects.toThrow("Test error");
    });
  });
});
```

## Common Issues and Solutions

1. **Module Mocking Order**

   - Always declare mocks before importing the module under test
   - Use `vi.mock()` at the top level of your test file

2. **VSCode API Mocking**

   - Use the provided `test-utils.ts` helpers
   - Mock only the VSCode APIs you need
   - Remember that VSCode APIs return Promises

3. **TypeScript AST Testing**

   - Create minimal AST nodes for testing
   - Use TypeScript's `createSourceFile` for parsing
   - Mock file system operations

4. **Debugging Tests**
   - Use `console.log()` for debugging (removed in production)
   - Run single test with `.only`
   - Use VSCode's debugger with the "Debug Tests" launch configuration
