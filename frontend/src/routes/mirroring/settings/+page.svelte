<script>
    import { goto } from '$app/navigation';

    let difficulty = '2';

    function beginGame() {
        goto(`/mirroring/mirroring?difficulty=${difficulty}`);
    }

    function goToDashboard() {
        goto('/dashboard');
    }
</script>

<style>
    .page-container {
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 100%;
        padding: 24px;
        box-sizing: border-box;
    }

    .content {
        text-align: center;
        max-width: 420px;
    }

    .settings-title {
        font-family: Georgia, serif;
        font-size: clamp(2.25rem, 5vw, 3rem);
        font-weight: bold;
        color: var(--af-mirroring-yellow);
        text-shadow: 0 4px 8px rgba(0, 0, 0, 0.45);
        margin: 0 0 28px;
    }

    .buttons {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 14px;
    }

    /* Play Again style: white pill, dark navy text */
    .btn-begin {
        display: block;
        width: 100%;
        max-width: 300px;
        padding: 14px 24px;
        font-size: 18px;
        font-weight: 600;
        color: var(--af-dark-navy);
        background: rgba(255, 255, 255, 0.95);
        border: 1px solid rgba(15, 20, 46, 0.2);
        border-radius: 9999px;
        cursor: pointer;
        transition: transform 0.08s ease, box-shadow 0.2s ease;
    }
    .btn-begin:hover {
        transform: translateY(-1px);
        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.2);
    }
    .btn-begin:active {
        transform: scale(0.985);
    }

    /* Home style: glow blue pill, white text */
    .btn-dashboard {
        display: block;
        width: 100%;
        max-width: 300px;
        padding: 14px 24px;
        font-size: 18px;
        font-weight: 600;
        color: #fff;
        background: var(--af-glow-blue);
        border: 1px solid var(--af-glow-blue);
        border-radius: 9999px;
        cursor: pointer;
        transition: transform 0.08s ease, filter 0.2s ease;
    }
    .btn-dashboard:hover {
        filter: brightness(1.05);
        transform: translateY(-1px);
    }
    .btn-dashboard:active {
        transform: scale(0.985);
    }
</style>

<div class="page-container">
    <div class="content">
        <h2 class="settings-title">Mirroring Game</h2>
        <div class="buttons">
            <button class="btn-begin" on:click={beginGame}>Let's Begin</button>
            <button class="btn-dashboard" on:click={goToDashboard}>Back to Dashboard</button>
        </div>
    </div>
</div>
