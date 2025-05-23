import React, { useState } from 'react';
import { cn } from '@/lib/utils';

export type ExecutionEnvironment = 'docker' | 'local' | 'remote';

export interface EnvironmentSelectorProps {
  onSelect: (environment: ExecutionEnvironment, remoteId?: string) => void;
  className?: string;
  defaultEnvironment?: ExecutionEnvironment;
}

export function EnvironmentSelector({
  onSelect,
  className,
  defaultEnvironment = 'docker'
}: EnvironmentSelectorProps) {
  const [selectedEnvironment, setSelectedEnvironment] = useState<ExecutionEnvironment>(defaultEnvironment);
  const [remoteId, setRemoteId] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const handleSelect = (env: ExecutionEnvironment) => {
    setSelectedEnvironment(env);
  };
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    // Call the onSelect callback with the selected environment
    onSelect(
      selectedEnvironment, 
      selectedEnvironment === 'remote' ? remoteId : undefined
    );
  };
  
  return (
    <div 
      className={cn(
        "bg-transparent text-white p-4 rounded-md max-w-xl mx-auto",
        className
      )}
    >
      <div className="mb-6 text-center">
        <h2 className="text-xl font-semibold mb-2">Select Execution Environment</h2>
        <p className="text-gray-400 text-sm">
          Choose where commands and tools will be executed
        </p>
      </div>
      
      <form onSubmit={handleSubmit}>
        <div className="flex flex-col gap-4 mb-6">
          <div 
            className={cn(
              "flex items-center border border-gray-600 p-3 rounded cursor-pointer hover:bg-gray-800 transition-colors",
              selectedEnvironment === 'docker' && "border-blue-500 bg-gray-800"
            )}
            onClick={() => handleSelect('docker')}
          >
            <input 
              type="radio" 
              id="docker" 
              name="environment" 
              value="docker" 
              checked={selectedEnvironment === 'docker'} 
              onChange={() => handleSelect('docker')} 
              className="mr-3"
            />
            <div>
              <label htmlFor="docker" className="text-white font-medium cursor-pointer">Docker</label>
              <p className="text-gray-400 text-sm">
                Run commands in an isolated Docker container (recommended)
              </p>
            </div>
          </div>
          
          <div 
            className={cn(
              "flex items-center border border-gray-600 p-3 rounded cursor-pointer hover:bg-gray-800 transition-colors",
              selectedEnvironment === 'local' && "border-blue-500 bg-gray-800"
            )}
            onClick={() => handleSelect('local')}
          >
            <input 
              type="radio" 
              id="local" 
              name="environment" 
              value="local" 
              checked={selectedEnvironment === 'local'}
              onChange={() => handleSelect('local')}
              className="mr-3"
            />
            <div>
              <label htmlFor="local" className="text-white font-medium cursor-pointer">Local System</label>
              <p className="text-gray-400 text-sm">
                Run commands directly on your local system
              </p>
            </div>
          </div>
          
          <div 
            className={cn(
              "flex items-center border border-gray-600 p-3 rounded cursor-pointer hover:bg-gray-800 transition-colors",
              selectedEnvironment === 'remote' && "border-blue-500 bg-gray-800"
            )}
            onClick={() => handleSelect('remote')}
          >
            <input 
              type="radio" 
              id="e2b" 
              name="environment" 
              value="e2b" 
              checked={selectedEnvironment === 'remote'}
              onChange={() => handleSelect('remote')}
              className="mr-3"
            />
            <div className="w-full">
              <label htmlFor="remote" className="text-white font-medium cursor-pointer">Remote Sandbox</label>
              <p className="text-gray-400 text-sm mb-2">
                Run commands in a remote cloud sandbox
              </p>
              
              {selectedEnvironment === 'remote' && (
                <div className="mt-2">
                  <label htmlFor="remoteId" className="text-white text-sm block mb-1">Remote Sandbox ID</label>
                  <input
                    type="text"
                    id="remoteId"
                    value={remoteId}
                    onChange={(e) => setRemoteId(e.target.value)}
                    placeholder="e.g., 41f712-a81f-42d7-97d3-cbe5527e8c7e"
                    className="bg-gray-900 border border-gray-600 rounded px-3 py-2 w-full text-white"
                    required={selectedEnvironment === 'remote'}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
        
        <div className="flex justify-center">
          <button 
            type="submit" 
            className={cn(
              "bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-md transition-colors",
              isSubmitting && "opacity-50 cursor-not-allowed"
            )}
            disabled={isSubmitting || (selectedEnvironment === 'remote' && !remoteId)}
          >
            {isSubmitting ? 'Setting up...' : 'Start Environment'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default EnvironmentSelector;