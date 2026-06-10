import React, { useState } from 'react';
import { Building, Users, Briefcase, CheckCircle, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';

export function OnboardingWizard() {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({ companyName: '', email: '', planTier: 'PRO' });

  const nextStep = () => setStep((s) => Math.min(s + 1, 4));
  const prevStep = () => setStep((s) => Math.max(s - 1, 1));

  const completeOnboarding = async () => {
    // Replace with real API call
    console.log('Completing onboarding with data:', formData);
    setStep(4);
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center py-20 px-4">
      <div className="max-w-2xl w-full bg-gray-900 border border-gray-800 rounded-2xl p-8 shadow-2xl">
        <h1 className="text-3xl font-bold mb-2">Welcome to TalentAI</h1>
        <p className="text-gray-400 mb-8">Let's get your enterprise workspace set up.</p>

        <div className="flex gap-4 mb-8">
          {[1, 2, 3].map((s) => (
            <div key={s} className={`h-2 flex-1 rounded-full ${step >= s ? 'bg-indigo-500' : 'bg-gray-800'}`} />
          ))}
        </div>

        {step === 1 && (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
            <h2 className="text-xl font-semibold flex items-center gap-2 mb-4">
              <Building className="text-indigo-400" /> Organization Details
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Company Name</label>
                <input 
                  type="text" 
                  value={formData.companyName}
                  onChange={(e) => setFormData({...formData, companyName: e.target.value})}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:border-indigo-500"
                  placeholder="Acme Corp"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Admin Email</label>
                <input 
                  type="email" 
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:border-indigo-500"
                  placeholder="admin@acme.com"
                />
              </div>
            </div>
            <button onClick={nextStep} className="mt-6 w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 rounded-lg flex items-center justify-center gap-2 transition-colors">
              Continue <ArrowRight size={18} />
            </button>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
            <h2 className="text-xl font-semibold flex items-center gap-2 mb-4">
              <Users className="text-indigo-400" /> Invite Team Members
            </h2>
            <div className="space-y-4">
              <p className="text-sm text-gray-400">Invite your recruiting team to collaborate.</p>
              <textarea 
                className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:border-indigo-500 h-32"
                placeholder="Enter email addresses separated by commas..."
              />
            </div>
            <div className="flex gap-4 mt-6">
              <button onClick={prevStep} className="flex-1 bg-gray-800 hover:bg-gray-700 text-white font-medium py-3 rounded-lg transition-colors">Back</button>
              <button onClick={nextStep} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 rounded-lg transition-colors">Continue</button>
            </div>
          </motion.div>
        )}

        {step === 3 && (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
            <h2 className="text-xl font-semibold flex items-center gap-2 mb-4">
              <Briefcase className="text-indigo-400" /> Plan Selection
            </h2>
            <div className="space-y-4">
              <div className="border border-indigo-500 bg-indigo-500/10 rounded-xl p-4 flex justify-between items-center cursor-pointer">
                <div>
                  <h3 className="font-bold">Enterprise Pro</h3>
                  <p className="text-sm text-gray-400">Unlimited jobs, full AI access</p>
                </div>
                <div className="text-xl font-bold">$499/mo</div>
              </div>
            </div>
            <div className="flex gap-4 mt-6">
              <button onClick={prevStep} className="flex-1 bg-gray-800 hover:bg-gray-700 text-white font-medium py-3 rounded-lg transition-colors">Back</button>
              <button onClick={completeOnboarding} className="flex-1 bg-green-600 hover:bg-green-700 text-white font-medium py-3 rounded-lg transition-colors">Complete Setup</button>
            </div>
          </motion.div>
        )}

        {step === 4 && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-8">
            <CheckCircle className="mx-auto text-green-500 w-16 h-16 mb-4" />
            <h2 className="text-2xl font-bold mb-2">Workspace Ready</h2>
            <p className="text-gray-400 mb-6">Your enterprise environment has been provisioned.</p>
            <a href="/" className="inline-block bg-indigo-600 hover:bg-indigo-700 px-6 py-3 rounded-lg font-medium transition-colors">Go to Dashboard</a>
          </motion.div>
        )}
      </div>
    </div>
  );
}
