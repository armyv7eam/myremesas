import { Building2 } from 'lucide-react';

interface BankLogoProps {
    bank: string;
    className?: string;
}

export function BankLogo({ bank, className = "w-9 h-9 text-xs" }: BankLogoProps) {
    const name = bank.toLowerCase();

    // Default generic styles
    let bg = "bg-gray-50";
    let text = "text-gray-500";
    let border = "border-gray-200";
    let content: React.ReactNode = <Building2 className="w-[50%] h-[50%]" />;

    if (name.includes('banesco')) {
        bg = 'bg-[#007A33]/15'; text = 'text-[#007A33]'; border = 'border-[#007A33]/30';
        content = <span className="font-extrabold font-sans italic tracking-tighter text-[1.1em]">B</span>;
    } else if (name.includes('mercantil')) {
        bg = 'bg-[#004A99]/15'; text = 'text-[#004A99]'; border = 'border-[#004A99]/30';
        content = <span className="font-extrabold font-serif text-[1.1em]">M</span>;
    } else if (name.includes('venezuela') || name.includes('bdv')) {
        bg = 'bg-[#E3001B]/15'; text = 'text-[#E3001B]'; border = 'border-[#E3001B]/30';
        content = <span className="font-black font-sans uppercase text-[1.1em]">V</span>;
    } else if (name.includes('provincial') || name.includes('bbva')) {
        bg = 'bg-[#072146]/15'; text = 'text-[#072146]'; border = 'border-[#072146]/30';
        content = <span className="font-bold font-sans text-[1.1em]">P</span>;
    } else if (name.includes('bancamiga')) {
        bg = 'bg-[#E3005A]/15'; text = 'text-[#E3005A]'; border = 'border-[#E3005A]/30';
        content = <span className="font-black font-sans leading-none">ba</span>;
    } else if (name.includes('bnc') || name.includes('nacional de credito')) {
        bg = 'bg-[#004B87]/15'; text = 'text-[#004B87]'; border = 'border-[#004B87]/30';
        content = <span className="font-black font-sans italic tracking-tighter text-[0.7em]">BNC</span>;
    } else if (name.includes('banplus')) {
        bg = 'bg-[#F28C00]/15'; text = 'text-[#F28C00]'; border = 'border-[#F28C00]/30';
        content = <span className="font-black text-[1.3em] leading-none">+</span>;
    } else if (name.includes('tesoro')) {
        bg = 'bg-[#004077]/15'; text = 'text-[#004077]'; border = 'border-[#004077]/30';
        content = <span className="font-bold font-serif text-[1.1em]">T</span>;
    } else if (name.includes('bicentenario')) {
        bg = 'bg-[#C8102E]/15'; text = 'text-[#C8102E]'; border = 'border-[#C8102E]/30';
        content = <span className="font-bold font-serif italic text-[1.1em]">B</span>;
    } else if (name.includes('exterior')) {
        bg = 'bg-[#00529B]/15'; text = 'text-[#00529B]'; border = 'border-[#00529B]/30';
        content = <span className="font-bold font-sans text-[1.1em]">E</span>;
    }

    return (
        <div className={`flex items-center justify-center rounded-lg border flex-shrink-0 ${bg} ${text} ${border} ${className}`}>
            {content}
        </div>
    );
}
