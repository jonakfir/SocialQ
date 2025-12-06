<script>
  export let label = '';
  export let onClick = () => {};
</script>

<button class="custom-button" on:click={onClick}>
  {label}
</button>

<style>
  .custom-button {
    padding: 10px 20px;
    border: 2px solid black;
    border-radius: 20px;
    background-color: white;
    cursor: pointer;
    font-weight: bold;
    margin: 8px 0;
    transition: all 0.2s ease-in-out;
  }

  .custom-button:hover {
    background-color: #f0f0f0;
  }
</style>
