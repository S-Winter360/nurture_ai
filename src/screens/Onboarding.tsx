import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronRight } from 'lucide-react';

const ONBOARDING_STEPS = [
  {
    image: '/onboarding_1.png',
    title: 'Track Your Journey',
    description: "Monitor every step of your pregnancy and your child's growth with ease."
  },
  {
    image: '/onboarding_2.png',
    title: 'Timely Reminders',
    description: 'Never miss an important vaccination or ANC visit with our smart alerts.'
  },
  {
    image: '/onboarding_3.png',
    title: 'AI Care Companion',
    description: 'Get personalized advice and guidance tailored to your specific health needs.'
  }
];

const Onboarding = () => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);

  const handleNext = () => {
    if (currentStep < ONBOARDING_STEPS.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      navigate('/home');
    }
  };

  const handleSkip = () => {
    navigate('/home');
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50 overflow-hidden relative">
      <div className="absolute top-0 left-0 right-0 p-6 flex justify-end z-10">
        {currentStep < ONBOARDING_STEPS.length - 1 && (
          <button 
            onClick={handleSkip}
            className="text-slate-500 font-medium text-sm hover:text-slate-800 transition-colors"
          >
            Skip
          </button>
        )}
      </div>

      <div className="flex-1 flex flex-col relative pt-16">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="flex-1 flex flex-col"
          >
            <div className="flex-1 flex items-center justify-center p-8 pb-0">
              <div className="w-full max-w-sm aspect-square relative flex items-center justify-center">
                <img 
                  src={ONBOARDING_STEPS[currentStep].image} 
                  alt={ONBOARDING_STEPS[currentStep].title}
                  className="w-full h-full object-contain drop-shadow-md"
                />
              </div>
            </div>
            
            <div className="px-8 py-8 text-center bg-white rounded-t-3xl shadow-[0_-4px_24px_rgba(0,0,0,0.02)] flex-shrink-0 z-10">
              <div className="flex justify-center gap-2 mb-8">
                {ONBOARDING_STEPS.map((_, idx) => (
                  <div 
                    key={idx}
                    className={`h-1.5 rounded-full transition-all duration-300 ${
                      idx === currentStep ? 'w-6 bg-primary' : 'w-1.5 bg-slate-200'
                    }`}
                  />
                ))}
              </div>
              
              <h1 className="text-2xl font-bold text-slate-900 mb-4">
                {ONBOARDING_STEPS[currentStep].title}
              </h1>
              <p className="text-slate-600 mb-8 leading-relaxed h-16">
                {ONBOARDING_STEPS[currentStep].description}
              </p>
              
              <button 
                onClick={handleNext}
                className="w-full bg-primary text-white py-4 rounded-xl font-semibold text-lg shadow-sm hover:bg-emerald-700 active:bg-emerald-800 transition-colors flex items-center justify-center gap-2"
              >
                {currentStep === ONBOARDING_STEPS.length - 1 ? 'Get Started' : 'Next'}
                {currentStep < ONBOARDING_STEPS.length - 1 && <ChevronRight className="w-5 h-5" />}
              </button>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};

export default Onboarding;
