import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { quickTransferSchema, QuickTransferFormData, DEFAULT_VALUES } from "../config";

export function useQuickTransferForm() {
    const {
        register,
        handleSubmit,
        formState: { errors },
        setValue,
        watch,
        reset,
    } = useForm<QuickTransferFormData>({
        resolver: zodResolver(quickTransferSchema),
        defaultValues: DEFAULT_VALUES,
    });

    const watchedDate = watch("transferDate");

    return {
        register,
        handleSubmit,
        errors,
        setValue,
        watchedDate,
        reset,
    };
}
