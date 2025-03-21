import React from 'react';

function App() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="max-w-md w-full p-6 space-y-4">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold">QCKFX Agent</h1>
          <p className="text-muted-foreground">
            A CLI-based AI software engineering agent
          </p>
        </div>
        <div className="bg-card rounded-lg p-4 border">
          <p className="text-card-foreground">
            This is a placeholder UI. The full Web UI is under development.
          </p>
        </div>
      </div>
    </div>
  );
}

export default App;