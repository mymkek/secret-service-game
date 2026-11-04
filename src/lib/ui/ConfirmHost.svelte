<script lang="ts">
	import { confirmAction } from './confirm.svelte';
	import ConfirmDialog from './kit/ConfirmDialog.svelte';
</script>

{#if confirmAction.current}
	{#key confirmAction.current}
		<ConfirmDialog info={confirmAction.current.info} onconfirm={() => confirmAction.accept()} oncancel={() => confirmAction.cancel()} />
	{/key}
{/if}
