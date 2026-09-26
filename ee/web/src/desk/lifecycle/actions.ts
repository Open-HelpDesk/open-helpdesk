"use server";

/**
 * SD-A6 — the writes of the joiners and leavers screen. A new arrival that is
 * not in the directory yet is created through the core (`upsertPerson`, which
 * also creates its portal contact) before its onboarding is scheduled.
 */
import { revalidatePath } from "next/cache";
import { upsertPerson } from "@/lib/desk";
import { scheduleOffboarding, scheduleOnboarding, setLifecycleTaskDone, setPack } from "@openhelpdesk/ee-desk";
import { deskAction } from "../shared/server";

const PATH = "/app/desk/lifecycle";

export async function scheduleOffboardingAction(personId: string, executeAt: string | null) {
  return deskAction("deskLifecycle", {}, async ({ tenant, actor }) => {
    const at = executeAt ? new Date(executeAt) : null;
    const planId = await scheduleOffboarding(tenant.id, personId, at && !Number.isNaN(at.getTime()) ? at.toISOString() : null, actor);
    revalidatePath(PATH);
    return { planId };
  });
}

export async function setTaskDoneAction(taskId: string, done: boolean) {
  return deskAction("deskLifecycle", {}, async ({ tenant, actor }) => {
    await setLifecycleTaskDone(tenant.id, taskId, done, actor);
    revalidatePath(PATH);
    return {};
  });
}

export async function savePackAction(department: string, appIds: string[]) {
  return deskAction("deskLifecycle", { managerOnly: true }, async ({ tenant, actor }) => {
    await setPack(tenant.id, department, appIds, actor);
    revalidatePath(PATH);
    return {};
  });
}

export type NewPerson = {
  name: string;
  email: string;
  title: string;
  department: string;
  managerEmail: string;
  startsOn: string;
};

export async function scheduleOnboardingAction(input: {
  personId: string | null;
  newPerson: NewPerson | null;
  appIds: string[];
  hardwareModels: string[];
}) {
  return deskAction("deskLifecycle", {}, async ({ tenant, actor, t }) => {
    let personId = input.personId;
    if (!personId) {
      const p = input.newPerson;
      if (!p || !p.name.trim() || !/^[^@\s]+@[^@\s]+$/.test(p.email.trim())) throw new Error(t("desk.ee.life.newPersonInvalid"));
      if (!/^\d{4}-\d{2}-\d{2}$/.test(p.startsOn)) throw new Error(t("desk.ee.life.startRequired"));
      const res = await upsertPerson(
        tenant.id,
        {
          name: p.name.trim(),
          email: p.email.trim().toLowerCase(),
          title: p.title.trim() || null,
          department: p.department.trim() || null,
          managerEmail: p.managerEmail || null,
          startsOn: p.startsOn,
          source: "manual",
        },
        actor,
      );
      personId = res.personId;
    }
    const planId = await scheduleOnboarding(tenant.id, { personId, appIds: input.appIds, hardwareModels: input.hardwareModels }, actor);
    revalidatePath(PATH);
    return { planId, personId };
  });
}
