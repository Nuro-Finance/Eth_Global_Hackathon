import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DEMO_CREDENTIALS } from "./config";

interface DemoCredentialsCardProps {
  onFillDemo: () => void;
}

export default function DemoCredentialsCard({
  onFillDemo,
}: DemoCredentialsCardProps) {
  const credentials = [
    { label: "Email", value: DEMO_CREDENTIALS.email },
    { label: "Password", value: DEMO_CREDENTIALS.password },
  ];

  return (
    <Card className="p-4 mb-6">
      <div className="flex items-center gap-2 mb-3">
        <Badge variant="primary" className="w-2 h-2 p-0 rounded-full" />
        <span className="text-[var(--color-text-primary)] text-sm font-medium">
          Demo Access
        </span>
      </div>
      <p className="text-[var(--color-text-muted)] text-sm mb-3">
        Use these credentials to test the dashboard:
      </p>
      <div className="space-y-2 text-sm">
        {credentials.map((cred) => (
          <div key={cred.label} className="flex justify-between items-center">
            <span className="text-[var(--color-text-muted)]">
              {cred.label}:
            </span>
            <span className="text-[var(--color-text-primary)] font-mono">
              {cred.value}
            </span>
          </div>
        ))}
      </div>
      <Button
        type="button"
        variant="outline"
        onClick={onFillDemo}
        className="w-full mt-3"
      >
        Auto-fill Demo Credentials
      </Button>
    </Card>
  );
}
